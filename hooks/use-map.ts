"use client"

import { useCallback, useMemo } from "react"
import { DEFAULT_MAP_VIEW } from "@/data/geography"
import { routePolyline } from "@/lib/routing"
import { TRAFFIC_TOKENS, VEHICLE_STATUS_TOKENS } from "@/lib/status-tokens"
import {
  telemetryBuffer,
  type TelemetryBuffer,
  type TelemetrySample,
} from "@/services/simulation"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
  type MapFocusRequest,
} from "@/stores"
import { useGeofenceStore } from "@/stores/geofence-store"
import type { Geofence, Location, TrafficLevel } from "@/types"
import { useGeofences } from "./use-geofences"

export interface RouteLine {
  readonly routeId: string
  readonly name: string
  readonly points: readonly Location[]
  readonly level: TrafficLevel
  readonly colour: string
  readonly dashed: boolean
}

export interface UseMapResult {
  /** Out-of-band position source. Read inside the render loop, not in React. */
  readonly telemetry: TelemetryBuffer
  readonly routeLines: readonly RouteLine[]
  readonly selectedVehicleId: string | null
  /** Corridor of whatever is selected, drawn on top of the overlay. */
  readonly highlightedRoute: RouteLine | null
  readonly focusRequest: MapFocusRequest | null
  readonly showRoutes: boolean
  /** Paints a density field instead of individual vehicles. */
  readonly densityView: boolean
  readonly zones: readonly Geofence[]
  /** True while the operator is choosing where to drop a new zone. */
  readonly placingZone: boolean
  readonly followSelection: boolean
  readonly defaultView: typeof DEFAULT_MAP_VIEW
  /** Predicate applied per frame to decide whether a marker is drawn. */
  matchesFilter(sample: TelemetrySample): boolean
  colourFor(sample: TelemetrySample): string
  selectVehicle(vehicleId: string): void
  clearSelection(): void
  consumeFocus(): void
  setShowRoutes(show: boolean): void
  setDensityView(density: boolean): void
  placeZone(centre: Location): void
  setFollowSelection(follow: boolean): void
}

/**
 * Map business logic.
 *
 * The important design choice: filtering is exposed as a *predicate*, not a
 * filtered array. The canvas layer evaluates it against the telemetry buffer
 * once per animation frame, so changing a filter costs one memo recomputation
 * instead of re-rendering 500 React markers, and a moving vehicle costs no
 * React work at all.
 */
export function useMap(): UseMapResult {
  const routes = useReferenceStore((state) => state.routes)
  const routesById = useReferenceStore((state) => state.routesById)
  const trafficByRoute = useReferenceStore((state) => state.trafficByRoute)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const deliveriesById = useDeliveryStore((state) => state.byId)

  const filters = useUiStore((state) => state.filters)
  const selection = useUiStore((state) => state.selection)
  const focusRequest = useUiStore((state) => state.mapFocus)
  const showRoutes = useUiStore((state) => state.showRoutes)
  const densityView = useUiStore((state) => state.densityView)
  const zones = useGeofenceStore((state) => state.zones)
  const placingZone = useGeofenceStore((state) => state.placing)
  const { placeAt } = useGeofences()
  const followSelection = useUiStore((state) => state.followSelection)
  const selectVehicle = useUiStore((state) => state.selectVehicle)
  const clearSelection = useUiStore((state) => state.clearSelection)
  const consumeFocus = useUiStore((state) => state.consumeMapFocus)
  const setShowRoutes = useUiStore((state) => state.setShowRoutes)
  const setDensityView = useUiStore((state) => state.setDensityView)
  const setFollowSelection = useUiStore((state) => state.setFollowSelection)

  const routeLines = useMemo<readonly RouteLine[]>(
    () =>
      routes.map((route) => {
        const level = trafficByRoute[route.id]?.level ?? "normal"
        return {
          routeId: route.id,
          name: route.name,
          points: routePolyline(route),
          level,
          colour: TRAFFIC_TOKENS[level].canvas,
          // Congested corridors are dashed as well as red, so the state is
          // legible without relying on colour.
          dashed: level === "congested",
        }
      }),
    [routes, trafficByRoute]
  )

  /**
   * Which corridor the selection is travelling. Showing the whole network at
   * once makes any single journey impossible to trace, so the selected one is
   * redrawn on top in the accent colour.
   */
  const highlightedRoute = useMemo<RouteLine | null>(() => {
    let routeId: string | null = null

    if (selection?.kind === "vehicle") {
      routeId = vehiclesById[selection.id]?.routeId ?? null
    } else if (selection?.kind === "delivery") {
      routeId = deliveriesById[selection.id]?.routeId ?? null
    } else if (selection?.kind === "driver") {
      // Follow the driver through to whatever they are currently driving.
      const vehicle = Object.values(vehiclesById).find(
        (entry) => entry.driverId === selection.id
      )
      routeId = vehicle?.routeId ?? null
    }

    if (!routeId) {
      return null
    }
    return routeLines.find((line) => line.routeId === routeId) ?? null
  }, [selection, vehiclesById, deliveriesById, routeLines])

  const matchesFilter = useCallback(
    (sample: TelemetrySample): boolean => {
      if (
        filters.vehicleStatus !== "ALL" &&
        sample.status !== filters.vehicleStatus
      ) {
        return false
      }

      if (filters.regions.length === 0) {
        return true
      }

      const route = sample.routeId ? routesById[sample.routeId] : undefined
      if (!route) {
        return false
      }

      return (
        filters.regions.includes(route.originRegion) ||
        filters.regions.includes(route.destinationRegion)
      )
    },
    [filters.vehicleStatus, filters.regions, routesById]
  )

  const colourFor = useCallback(
    (sample: TelemetrySample): string =>
      VEHICLE_STATUS_TOKENS[sample.status].canvas,
    []
  )

  return {
    telemetry: telemetryBuffer,
    routeLines,
    selectedVehicleId: selection?.kind === "vehicle" ? selection.id : null,
    highlightedRoute,
    focusRequest,
    showRoutes,
    densityView,
    zones,
    placingZone,
    followSelection,
    defaultView: DEFAULT_MAP_VIEW,
    matchesFilter,
    colourFor,
    selectVehicle,
    clearSelection,
    consumeFocus,
    setShowRoutes,
    setDensityView,
    placeZone: placeAt,
    setFollowSelection,
  }
}
