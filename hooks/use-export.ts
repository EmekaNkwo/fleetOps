"use client"

import { useCallback, useMemo } from "react"
import { REGION_BY_ID } from "@/data/geography"
import { toCsv, timestampedFilename, type CsvColumn } from "@/lib/csv"
import {
  compareDeliveryRows,
  matchesDeliveryFilters,
  matchesVehicleFilters,
  type DeliveryRow,
} from "@/lib/filtering"
import { isActiveDeliveryStatus } from "@/lib/calculations"
import { downloadCsv } from "@/services/export/download"
import {
  useDeliveryStore,
  useIncidentStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type {
  Delivery,
  Driver,
  Incident,
  RegionId,
  Route,
  Vehicle,
} from "@/types"
import { useFilterContext } from "./use-fleet"

/** A serialised sheet: the CSV text and how many data rows it holds. */
interface Sheet {
  readonly content: string
  readonly rowCount: number
}

/** Pairs rows with their own columns so the type never has to be widened. */
function sheet<T>(
  columns: readonly CsvColumn<T>[],
  rows: readonly T[]
): Sheet {
  return { content: toCsv(columns, rows), rowCount: rows.length }
}

/** What an export produced, so the caller can tell the operator. */
export interface ExportOutcome {
  readonly ok: boolean
  readonly rowCount: number
  readonly filename: string
  readonly reason?: string
}

export type ExportDataset =
  | "deliveries"
  | "fleet"
  | "drivers"
  | "routes"
  | "incidents"

export interface UseExportResult {
  /** Dataset ids in menu order, with the label and current row count. */
  readonly datasets: readonly {
    readonly id: ExportDataset
    readonly label: string
    readonly hint: string
  }[]
  exportDataset(dataset: ExportDataset): ExportOutcome
}

function regionName(region: RegionId | null): string {
  return region ? (REGION_BY_ID[region]?.name ?? region) : ""
}

/** ISO 8601 so a spreadsheet parses it as a date rather than as text. */
function isoOrBlank(at: number | null): string {
  return at === null ? "" : new Date(at).toISOString()
}

const DELIVERY_COLUMNS: readonly CsvColumn<DeliveryRow>[] = [
  { header: "Reference", value: (row) => row.delivery.reference },
  { header: "Status", value: (row) => row.delivery.status },
  { header: "Priority", value: (row) => row.delivery.priority },
  { header: "Customer", value: (row) => row.customerName },
  { header: "Origin", value: (row) => row.originName },
  { header: "Origin region", value: (row) => regionName(row.delivery.originRegion) },
  { header: "Destination", value: (row) => row.destinationName },
  {
    header: "Destination region",
    value: (row) => regionName(row.delivery.destinationRegion),
  },
  { header: "Driver", value: (row) => row.driverName },
  { header: "Vehicle", value: (row) => row.vehicleCallSign },
  { header: "Weight (kg)", value: (row) => row.delivery.weightKg },
  { header: "Remaining (km)", value: (row) => row.delivery.remainingKm.toFixed(1) },
  { header: "Progress (%)", value: (row) => Math.round(row.delivery.progressFraction * 100) },
  { header: "Delay (min)", value: (row) => Math.round(row.delivery.delayMinutes) },
  { header: "Created at", value: (row) => isoOrBlank(row.delivery.createdAt) },
  { header: "Promised at", value: (row) => isoOrBlank(row.delivery.promisedAt) },
  { header: "ETA", value: (row) => isoOrBlank(row.delivery.etaAt) },
  { header: "Original ETA", value: (row) => isoOrBlank(row.delivery.originalEtaAt) },
  { header: "Completed at", value: (row) => isoOrBlank(row.delivery.completedAt) },
]

interface VehicleRow {
  readonly vehicle: Vehicle
  readonly driverName: string
  readonly routeName: string
}

const FLEET_COLUMNS: readonly CsvColumn<VehicleRow>[] = [
  { header: "Call sign", value: (row) => row.vehicle.callSign },
  { header: "Plate", value: (row) => row.vehicle.plateNumber },
  { header: "Type", value: (row) => row.vehicle.type },
  { header: "Status", value: (row) => row.vehicle.status },
  { header: "Driver", value: (row) => row.driverName },
  { header: "Route", value: (row) => row.routeName },
  { header: "Home region", value: (row) => regionName(row.vehicle.homeRegion) },
  { header: "Speed (km/h)", value: (row) => Math.round(row.vehicle.speed) },
  { header: "Fuel (%)", value: (row) => Math.round(row.vehicle.fuelLevel) },
  { header: "Mileage (km)", value: (row) => Math.round(row.vehicle.mileageKm) },
  { header: "Capacity (kg)", value: (row) => row.vehicle.capacityKg },
  { header: "Latitude", value: (row) => row.vehicle.location.lat.toFixed(5) },
  { header: "Longitude", value: (row) => row.vehicle.location.lng.toFixed(5) },
  { header: "Last maintenance", value: (row) => isoOrBlank(row.vehicle.lastMaintenance) },
  { header: "Last seen", value: (row) => isoOrBlank(row.vehicle.lastSeen) },
]

interface DriverRow {
  readonly driver: Driver
  readonly vehicleCallSign: string
  readonly activeDeliveries: number
}

const DRIVER_COLUMNS: readonly CsvColumn<DriverRow>[] = [
  { header: "Name", value: (row) => row.driver.name },
  { header: "Status", value: (row) => row.driver.status },
  { header: "Phone", value: (row) => row.driver.phone },
  { header: "Rating", value: (row) => row.driver.rating.toFixed(2) },
  { header: "Home region", value: (row) => regionName(row.driver.homeRegion) },
  { header: "Years of service", value: (row) => row.driver.yearsOfService },
  { header: "Deliveries completed", value: (row) => row.driver.deliveriesCompleted },
  { header: "Vehicle", value: (row) => row.vehicleCallSign },
  { header: "Active deliveries", value: (row) => row.activeDeliveries },
]

interface RouteRow {
  readonly route: Route
  readonly trafficLevel: string
  readonly trafficDescription: string
  readonly vehiclesOnRoute: number
  readonly activeDeliveries: number
}

const ROUTE_COLUMNS: readonly CsvColumn<RouteRow>[] = [
  { header: "Route", value: (row) => row.route.name },
  { header: "Corridor", value: (row) => row.route.corridorId },
  { header: "Origin region", value: (row) => regionName(row.route.originRegion) },
  {
    header: "Destination region",
    value: (row) => regionName(row.route.destinationRegion),
  },
  { header: "Distance (km)", value: (row) => row.route.totalDistanceKm.toFixed(1) },
  { header: "Free-flow speed (km/h)", value: (row) => row.route.freeFlowSpeed },
  { header: "Traffic", value: (row) => row.trafficLevel },
  { header: "Traffic detail", value: (row) => row.trafficDescription },
  { header: "Vehicles on route", value: (row) => row.vehiclesOnRoute },
  { header: "Active deliveries", value: (row) => row.activeDeliveries },
]

const INCIDENT_COLUMNS: readonly CsvColumn<Incident>[] = [
  { header: "Reference", value: (incident) => incident.reference },
  { header: "Type", value: (incident) => incident.type },
  { header: "Severity", value: (incident) => incident.severity },
  { header: "Status", value: (incident) => incident.status },
  { header: "Title", value: (incident) => incident.title },
  { header: "Description", value: (incident) => incident.description },
  { header: "Region", value: (incident) => regionName(incident.region) },
  { header: "Assignee", value: (incident) => incident.assignee ?? "" },
  { header: "Opened at", value: (incident) => isoOrBlank(incident.createdAt) },
  { header: "Resolved at", value: (incident) => isoOrBlank(incident.resolvedAt) },
  { header: "Log entries", value: (incident) => incident.log.length },
]

/**
 * Export of whatever the operator is currently looking at.
 *
 * Filters and sort order are applied, deliberately: an operator who has
 * narrowed the board to delayed runs in Lagos and presses export wants those
 * rows, in that order, not all 680. The datasets that have no filter of their
 * own — drivers, routes, incidents — export in full.
 *
 * Every read goes through `getState()` rather than a selector. This hook is
 * mounted in the header and would otherwise re-render the whole chrome on
 * every simulation commit to support a button that is pressed once an hour.
 */
export function useExport(): UseExportResult {
  const context = useFilterContext()

  const buildDeliveries = useCallback((): Sheet => {
    const { byId, ids } = useDeliveryStore.getState()
    const { filters, table } = useUiStore.getState()
    const { routesById, driversById, customersById } = useReferenceStore.getState()
    const vehiclesById = useVehicleStore.getState().byId

    const rows: DeliveryRow[] = []
    for (const id of ids) {
      const delivery = byId[id]
      if (!delivery || !matchesDeliveryFilters(delivery, filters, context)) {
        continue
      }
      const route = routesById[delivery.routeId]
      const vehicle = delivery.vehicleId ? vehiclesById[delivery.vehicleId] : undefined
      const driver = delivery.driverId ? driversById[delivery.driverId] : undefined

      rows.push({
        delivery,
        customerName: customersById[delivery.customerId]?.name ?? "Unknown",
        driverName: driver?.shortName ?? "Unassigned",
        vehicleCallSign: vehicle?.callSign ?? "—",
        originName: route?.origin.name ?? "—",
        destinationName: route?.destination.name ?? "—",
      })
    }

    rows.sort(compareDeliveryRows(table.sortBy, table.sortDirection))
    return sheet(DELIVERY_COLUMNS, rows)
  }, [context])

  const buildFleet = useCallback((): Sheet => {
    const { byId, ids } = useVehicleStore.getState()
    const { filters } = useUiStore.getState()
    const { routesById, driversById } = useReferenceStore.getState()

    const rows: VehicleRow[] = []
    for (const id of ids) {
      const vehicle = byId[id]
      if (!vehicle || !matchesVehicleFilters(vehicle, filters, context)) {
        continue
      }
      rows.push({
        vehicle,
        driverName: driversById[vehicle.driverId]?.name ?? "Unassigned",
        routeName: vehicle.routeId ? (routesById[vehicle.routeId]?.name ?? "") : "",
      })
    }
    return sheet(FLEET_COLUMNS, rows)
  }, [context])

  const buildDrivers = useCallback((): Sheet => {
    const { drivers } = useReferenceStore.getState()
    const vehicles = useVehicleStore.getState()
    const deliveries = useDeliveryStore.getState()

    const callSignByDriver: Record<string, string> = {}
    for (const id of vehicles.ids) {
      const vehicle = vehicles.byId[id]
      if (vehicle) {
        callSignByDriver[vehicle.driverId] = vehicle.callSign
      }
    }

    const activeByDriver: Record<string, number> = {}
    for (const id of deliveries.ids) {
      const delivery = deliveries.byId[id]
      if (delivery?.driverId && isActiveDeliveryStatus(delivery.status)) {
        activeByDriver[delivery.driverId] =
          (activeByDriver[delivery.driverId] ?? 0) + 1
      }
    }

    return sheet(
      DRIVER_COLUMNS,
      drivers.map((driver) => ({
        driver,
        vehicleCallSign: callSignByDriver[driver.id] ?? "",
        activeDeliveries: activeByDriver[driver.id] ?? 0,
      }))
    )
  }, [])

  const buildRoutes = useCallback((): Sheet => {
    const { routes, trafficByRoute } = useReferenceStore.getState()
    const vehicles = useVehicleStore.getState()
    const deliveries = useDeliveryStore.getState()

    const vehiclesOn: Record<string, number> = {}
    for (const id of vehicles.ids) {
      const routeId = vehicles.byId[id]?.routeId
      if (routeId) {
        vehiclesOn[routeId] = (vehiclesOn[routeId] ?? 0) + 1
      }
    }

    const deliveriesOn: Record<string, number> = {}
    for (const id of deliveries.ids) {
      const delivery = deliveries.byId[id]
      if (delivery && isActiveDeliveryStatus(delivery.status)) {
        deliveriesOn[delivery.routeId] = (deliveriesOn[delivery.routeId] ?? 0) + 1
      }
    }

    return sheet(
      ROUTE_COLUMNS,
      routes.map((route) => ({
        route,
        trafficLevel: trafficByRoute[route.id]?.level ?? "normal",
        trafficDescription: trafficByRoute[route.id]?.description ?? "",
        vehiclesOnRoute: vehiclesOn[route.id] ?? 0,
        activeDeliveries: deliveriesOn[route.id] ?? 0,
      }))
    )
  }, [])

  const buildIncidents = useCallback((): Sheet => {
    const { byId, ids } = useIncidentStore.getState()
    return sheet(
      INCIDENT_COLUMNS,
      ids
        .map((id) => byId[id])
        .filter((incident): incident is Incident => incident !== undefined)
    )
  }, [])

  const exportDataset = useCallback(
    (dataset: ExportDataset): ExportOutcome => {
      const built =
        dataset === "deliveries"
          ? buildDeliveries()
          : dataset === "fleet"
            ? buildFleet()
            : dataset === "drivers"
              ? buildDrivers()
              : dataset === "routes"
                ? buildRoutes()
                : buildIncidents()

      const filename = timestampedFilename(`fleetops-${dataset}`, Date.now())
      const result = downloadCsv(filename, built.content)

      return {
        ok: result.ok,
        rowCount: built.rowCount,
        filename,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      }
    },
    [buildDeliveries, buildFleet, buildDrivers, buildRoutes, buildIncidents]
  )

  const datasets = useMemo(
    () =>
      [
        {
          id: "deliveries" as const,
          label: "Delivery board",
          hint: "current filters and sort order",
        },
        { id: "fleet" as const, label: "Fleet", hint: "current filters" },
        { id: "drivers" as const, label: "Drivers", hint: "full roster" },
        { id: "routes" as const, label: "Routes", hint: "with live traffic" },
        { id: "incidents" as const, label: "Incidents", hint: "open and resolved" },
      ] as const,
    []
  )

  return { datasets, exportDataset }
}
