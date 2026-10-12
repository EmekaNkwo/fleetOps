"use client"

import { useMemo } from "react"
import { REGION_BY_ID } from "@/data/geography"
import {
  effectiveSpeed,
  isActiveDeliveryStatus,
  isInFlightDeliveryStatus,
} from "@/lib/calculations"
import { paginate } from "@/lib/filtering"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import {
  useWorkspaceStore,
  type RouteTrafficFilter,
} from "@/stores/workspace-store"
import type {
  RouteColumnId,
  Route,
  SortDirection,
  TrafficLevel,
} from "@/types"

export interface RouteRow {
  readonly route: Route
  readonly originName: string
  readonly destinationName: string
  readonly originRegionName: string
  readonly destinationRegionName: string
  readonly trafficLevel: TrafficLevel
  readonly trafficDescription: string
  /** Live speed a vehicle achieves here once traffic is applied. */
  readonly effectiveSpeedKmh: number
  readonly vehicleCount: number
  readonly activeDeliveries: number
  readonly delayedDeliveries: number
  /** Mean slippage across live deliveries on this corridor, in minutes. */
  readonly averageDelayMinutes: number
}

export interface UseRoutesResult {
  readonly rows: readonly RouteRow[]
  readonly visibleRows: readonly RouteRow[]
  readonly totalRows: number
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly sortBy: RouteColumnId
  readonly sortDirection: SortDirection
  readonly trafficFilter: RouteTrafficFilter
  readonly summary: {
    readonly congested: number
    readonly slow: number
    readonly clear: number
    readonly worstRouteName: string | null
  }
  sortByColumn(column: RouteColumnId): void
  setPage(page: number): void
  setPageSize(size: number): void
  setTrafficFilter(level: RouteTrafficFilter): void
  /** Draws this corridor on the map and switches to it. */
  highlight(routeId: string): void
}

const PAGE_SIZES: readonly number[] = [10, 25, 50]

/** Ordered worst-first, so sorting by traffic puts trouble at the top. */
const TRAFFIC_RANK: Readonly<Record<TrafficLevel, number>> = {
  congested: 2,
  slow: 1,
  normal: 0,
}

function compareRows(
  column: RouteColumnId,
  direction: SortDirection
): (a: RouteRow, b: RouteRow) => number {
  const sign = direction === "asc" ? 1 : -1

  return (a, b) => {
    switch (column) {
      case "origin":
        return sign * a.originName.localeCompare(b.originName)
      case "destination":
        return sign * a.destinationName.localeCompare(b.destinationName)
      case "distance":
        return sign * (a.route.totalDistanceKm - b.route.totalDistanceKm)
      case "traffic":
        return (
          sign * (TRAFFIC_RANK[a.trafficLevel] - TRAFFIC_RANK[b.trafficLevel]) ||
          sign * (a.averageDelayMinutes - b.averageDelayMinutes)
        )
      case "speed":
        return sign * (a.effectiveSpeedKmh - b.effectiveSpeedKmh)
      case "vehicles":
        return sign * (a.vehicleCount - b.vehicleCount)
      case "deliveries":
        return sign * (a.activeDeliveries - b.activeDeliveries)
      case "delayed":
        return (
          sign * (a.delayedDeliveries - b.delayedDeliveries) ||
          sign * (a.averageDelayMinutes - b.averageDelayMinutes)
        )
      case "name":
      default:
        return sign * a.route.name.localeCompare(b.route.name)
    }
  }
}

/**
 * The corridor view.
 *
 * Traffic is the hidden variable behind most of what the rest of the console
 * shows: a delayed delivery, a slow vehicle and a traffic incident are usually
 * three views of one congested corridor. Until now the only way to see that was
 * as a colour on the map, which tells you where the problem is but not how much
 * work is sitting behind it. This counts the work.
 */
export function useRoutes(): UseRoutesResult {
  const routes = useReferenceStore((state) => state.routes)
  const trafficByRoute = useReferenceStore((state) => state.trafficByRoute)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const vehicleIds = useVehicleStore((state) => state.ids)
  const vehicleVersion = useVehicleStore((state) => state.version)

  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)

  const regions = useUiStore((state) => state.filters.regions)
  const query = useUiStore((state) => state.filters.query)
  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)
  const setWorkspace = useUiStore((state) => state.setWorkspace)

  const view = useWorkspaceStore((state) => state.routes)
  const trafficFilter = useWorkspaceStore((state) => state.routeTraffic)
  const sortByColumn = useWorkspaceStore((state) => state.sortRoutes)
  const setPage = useWorkspaceStore((state) => state.setRoutesPage)
  const setPageSize = useWorkspaceStore((state) => state.setRoutesPageSize)
  const setTrafficFilter = useWorkspaceStore((state) => state.setRouteTraffic)

  const allRows = useMemo<readonly RouteRow[]>(() => {
    const vehicleCounts = new Map<string, number>()
    const firstVehicle = new Map<string, string>()
    for (const id of vehicleIds) {
      const vehicle = vehiclesById[id]
      if (!vehicle?.routeId) {
        continue
      }
      vehicleCounts.set(vehicle.routeId, (vehicleCounts.get(vehicle.routeId) ?? 0) + 1)
      if (!firstVehicle.has(vehicle.routeId)) {
        firstVehicle.set(vehicle.routeId, vehicle.id)
      }
    }

    interface Load {
      active: number
      delayed: number
      delaySum: number
    }
    const loads = new Map<string, Load>()
    for (const id of deliveryIds) {
      const delivery = deliveriesById[id]
      if (!delivery || !isActiveDeliveryStatus(delivery.status)) {
        continue
      }
      const load = loads.get(delivery.routeId) ?? {
        active: 0,
        delayed: 0,
        delaySum: 0,
      }
      load.active += 1
      load.delaySum += delivery.delayMinutes
      if (isInFlightDeliveryStatus(delivery.status) && delivery.delayMinutes > 0) {
        load.delayed += 1
      }
      loads.set(delivery.routeId, load)
    }

    return routes.map((route) => {
      const condition = trafficByRoute[route.id]
      const level: TrafficLevel = condition?.level ?? "normal"
      const load = loads.get(route.id)

      return {
        route,
        originName: route.origin.name,
        destinationName: route.destination.name,
        originRegionName:
          REGION_BY_ID[route.originRegion]?.name ?? route.originRegion,
        destinationRegionName:
          REGION_BY_ID[route.destinationRegion]?.name ?? route.destinationRegion,
        trafficLevel: level,
        trafficDescription: condition?.description ?? "Free flowing",
        // No jitter: this column is the corridor's nominal speed under its
        // current traffic, not any one driver's luck on it.
        effectiveSpeedKmh: effectiveSpeed(route.freeFlowSpeed, level, 0),
        vehicleCount: vehicleCounts.get(route.id) ?? 0,
        activeDeliveries: load?.active ?? 0,
        delayedDeliveries: load?.delayed ?? 0,
        averageDelayMinutes:
          load && load.active > 0 ? load.delaySum / load.active : 0,
      }
    })
  }, [
    routes,
    trafficByRoute,
    vehicleIds,
    vehiclesById,
    vehicleVersion,
    deliveryIds,
    deliveriesById,
    deliveryVersion,
  ])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = allRows.filter((row) => {
      if (trafficFilter !== "ALL" && row.trafficLevel !== trafficFilter) {
        return false
      }
      if (
        regions.length > 0 &&
        !regions.includes(row.route.originRegion) &&
        !regions.includes(row.route.destinationRegion)
      ) {
        return false
      }
      if (needle.length === 0) {
        return true
      }
      return row.route.name.toLowerCase().includes(needle)
    })

    return [...filtered].sort(compareRows(view.sortBy, view.sortDirection))
  }, [allRows, regions, query, trafficFilter, view.sortBy, view.sortDirection])

  const pageState = useMemo(
    () => paginate(rows, view.page, view.pageSize),
    [rows, view.page, view.pageSize]
  )

  const summary = useMemo(() => {
    let congested = 0
    let slow = 0
    let clear = 0
    let worst: RouteRow | null = null

    for (const row of allRows) {
      if (row.trafficLevel === "congested") {
        congested += 1
      } else if (row.trafficLevel === "slow") {
        slow += 1
      } else {
        clear += 1
      }

      if (!worst || row.delayedDeliveries > worst.delayedDeliveries) {
        worst = row
      }
    }

    return {
      congested,
      slow,
      clear,
      worstRouteName:
        worst && worst.delayedDeliveries > 0 ? worst.route.name : null,
    }
  }, [allRows])

  /**
   * There is no "select a route" concept in the selection model, and inventing
   * one for this table would mean a fifth selection kind that only one surface
   * produces. Focusing a vehicle working the corridor gets the operator to the
   * same place — the map, centred on the problem — using machinery that already
   * exists everywhere else.
   */
  const highlight = useMemo(() => {
    const representative = new Map<string, string>()
    for (const id of vehicleIds) {
      const vehicle = vehiclesById[id]
      if (vehicle?.routeId && !representative.has(vehicle.routeId)) {
        representative.set(vehicle.routeId, vehicle.id)
      }
    }

    return (routeId: string): void => {
      const vehicleId = representative.get(routeId)
      if (vehicleId) {
        focusVehicleOnMap(vehicleId)
      }
      setWorkspace("map")
    }
  }, [vehicleIds, vehiclesById, focusVehicleOnMap, setWorkspace])

  return {
    rows,
    visibleRows: pageState.rows,
    totalRows: rows.length,
    page: pageState.page,
    pageCount: pageState.pageCount,
    pageSize: view.pageSize,
    sortBy: view.sortBy,
    sortDirection: view.sortDirection,
    trafficFilter,
    summary,
    sortByColumn,
    setPage,
    setPageSize,
    setTrafficFilter,
    highlight,
  }
}

export { PAGE_SIZES as ROUTE_PAGE_SIZES }
