"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { FLEET_PAGE_SIZES } from "@/data/config"
import {
  matchesVehicleFilters,
  paginate,
  type FilterContext,
} from "@/lib/filtering"
import { resolveProgress } from "@/lib/routing"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type {
  Delivery,
  Driver,
  FleetCounts,
  Route,
  RouteProgress,
  TrafficCondition,
  Vehicle,
  VehicleStatus,
  VehicleStatusFilter,
} from "@/types"

/** Everything the vehicle detail panel needs, resolved in one place. */
export interface VehicleDetail {
  readonly vehicle: Vehicle
  readonly driver: Driver | null
  readonly route: Route | null
  readonly delivery: Delivery | null
  readonly progress: RouteProgress | null
  readonly traffic: TrafficCondition | null
}

export interface UseFleetResult {
  readonly vehicles: readonly Vehicle[]
  /** Everything matching the filters, across every page. */
  readonly matchingVehicles: readonly Vehicle[]
  /** The current page of `matchingVehicles`. */
  readonly visibleVehicles: readonly Vehicle[]
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly pageSizes: readonly number[]
  /** 1-based index of the first row on this page, for "25–50 of 520". */
  readonly rangeStart: number
  readonly rangeEnd: number
  readonly counts: FleetCounts
  readonly statusFilter: VehicleStatusFilter
  readonly selectedVehicleId: string | null
  readonly selectedVehicle: VehicleDetail | null
  readonly isFiltered: boolean
  selectVehicle(vehicleId: string): void
  clearSelection(): void
  setStatusFilter(status: VehicleStatusFilter): void
  setPage(page: number): void
  setPageSize(size: number): void
  focusOnMap(vehicleId: string): void
  getVehicle(vehicleId: string): Vehicle | null
  getDetail(vehicleId: string): VehicleDetail | null
  countByStatus(status: VehicleStatus): number
}

function useFilterContext(): FilterContext {
  const routesById = useReferenceStore((state) => state.routesById)
  const drivers = useReferenceStore((state) => state.drivers)
  const customers = useReferenceStore((state) => state.customers)

  return useMemo(() => {
    const driverNameById: Record<string, string> = {}
    for (const driver of drivers) {
      driverNameById[driver.id] = driver.name
    }
    const customerNameById: Record<string, string> = {}
    for (const customer of customers) {
      customerNameById[customer.id] = customer.name
    }
    return { routesById, driverNameById, customerNameById }
  }, [routesById, drivers, customers])
}

/**
 * Fleet business logic: filtering, selection and detail composition.
 *
 * Components receive finished data and callbacks. They never reach into the
 * stores, never compute a derived status and never know that a simulation
 * exists — which is the whole point of this layer.
 */
export function useFleet(): UseFleetResult {
  const byId = useVehicleStore((state) => state.byId)
  const ids = useVehicleStore((state) => state.ids)
  const counts = useVehicleStore((state) => state.counts)
  const version = useVehicleStore((state) => state.version)

  const deliveriesById = useDeliveryStore((state) => state.byId)
  const routesById = useReferenceStore((state) => state.routesById)
  const driversById = useReferenceStore((state) => state.driversById)
  const trafficByRoute = useReferenceStore((state) => state.trafficByRoute)

  const filters = useUiStore((state) => state.filters)
  const fleetPage = useUiStore((state) => state.fleet.page)
  const fleetPageSize = useUiStore((state) => state.fleet.pageSize)
  const setPage = useUiStore((state) => state.setFleetPage)
  const setPageSize = useUiStore((state) => state.setFleetPageSize)
  const selection = useUiStore((state) => state.selection)
  const selectVehicleAction = useUiStore((state) => state.selectVehicle)
  const clearSelection = useUiStore((state) => state.clearSelection)
  const setStatusFilter = useUiStore((state) => state.setVehicleStatusFilter)
  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)

  const context = useFilterContext()

  const vehicles = useMemo(
    () =>
      ids
        .map((id) => byId[id])
        .filter((vehicle): vehicle is Vehicle => vehicle !== undefined),
    // `version` is the commit marker; `byId` is replaced on every commit, so
    // depending on both keeps this honest without deep comparison.
    [ids, byId, version]
  )

  const matchingVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) =>
        matchesVehicleFilters(vehicle, filters, context)
      ),
    [vehicles, filters, context]
  )

  const pageState = useMemo(
    () => paginate(matchingVehicles, fleetPage, fleetPageSize),
    [matchingVehicles, fleetPage, fleetPageSize]
  )

  const getVehicle = useCallback(
    (vehicleId: string): Vehicle | null => byId[vehicleId] ?? null,
    [byId]
  )

  const getDetail = useCallback(
    (vehicleId: string): VehicleDetail | null => {
      const vehicle = byId[vehicleId]
      if (!vehicle) {
        return null
      }

      const route = vehicle.routeId ? (routesById[vehicle.routeId] ?? null) : null
      const delivery = vehicle.deliveryId
        ? (deliveriesById[vehicle.deliveryId] ?? null)
        : null
      const travelledKm =
        route && delivery
          ? Math.max(0, route.totalDistanceKm - delivery.remainingKm)
          : 0

      return {
        vehicle,
        driver: driversById[vehicle.driverId] ?? null,
        route,
        delivery,
        progress: route ? resolveProgress(route, travelledKm) : null,
        traffic: route ? (trafficByRoute[route.id] ?? null) : null,
      }
    },
    [byId, routesById, deliveriesById, driversById, trafficByRoute]
  )

  const selectedVehicleId =
    selection?.kind === "vehicle" ? selection.id : null

  const selectedVehicle = useMemo(
    () => (selectedVehicleId ? getDetail(selectedVehicleId) : null),
    [selectedVehicleId, getDetail]
  )

  const countByStatus = useCallback(
    (status: VehicleStatus): number => {
      switch (status) {
        case "ON_ROUTE":
          return counts.onRoute
        case "OFFLINE":
          return counts.offline
        case "DELAYED":
          return counts.delayed
        case "AT_RISK":
          return counts.atRisk
        case "IDLE":
        case "DELIVERED":
          return counts.idle
        default:
          return 0
      }
    },
    [counts]
  )

  /**
   * Reveal the selection.
   *
   * A vehicle is just as often chosen from the map, a search result or an
   * alert as from this list, and with the rail paginated that choice would
   * otherwise land on a page the operator cannot see. Jumping to the page
   * holding it keeps the list and the rest of the console pointing at the same
   * vehicle.
   *
   * Keyed on the selection changing, not on the page: paging away from a
   * selected vehicle by hand must not drag the view straight back.
   */
  const revealedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedVehicleId || revealedRef.current === selectedVehicleId) {
      revealedRef.current = selectedVehicleId
      return
    }
    revealedRef.current = selectedVehicleId

    const index = matchingVehicles.findIndex(
      (vehicle) => vehicle.id === selectedVehicleId
    )
    if (index === -1) {
      return
    }

    const target = Math.floor(index / fleetPageSize)
    if (target !== pageState.page) {
      setPage(target)
    }
  }, [
    selectedVehicleId,
    matchingVehicles,
    fleetPageSize,
    pageState.page,
    setPage,
  ])

  const rangeStart =
    pageState.rows.length === 0 ? 0 : pageState.page * fleetPageSize + 1

  return {
    vehicles,
    matchingVehicles,
    visibleVehicles: pageState.rows,
    page: pageState.page,
    pageCount: pageState.pageCount,
    pageSize: fleetPageSize,
    pageSizes: FLEET_PAGE_SIZES,
    rangeStart,
    rangeEnd: rangeStart === 0 ? 0 : rangeStart + pageState.rows.length - 1,
    counts,
    statusFilter: filters.vehicleStatus,
    selectedVehicleId,
    selectedVehicle,
    isFiltered: matchingVehicles.length !== vehicles.length,
    selectVehicle: selectVehicleAction,
    clearSelection,
    setStatusFilter,
    setPage,
    setPageSize,
    focusOnMap: focusVehicleOnMap,
    getVehicle,
    getDetail,
    countByStatus,
  }
}

export { useFilterContext }
