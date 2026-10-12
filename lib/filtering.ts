import type {
  Delivery,
  DeliveryColumnId,
  DeliveryStatusFilter,
  OperationsFilters,
  RegionId,
  Route,
  SortDirection,
  Vehicle,
  VehicleStatusFilter,
} from "@/types"

export interface FilterContext {
  readonly routesById: Readonly<Record<string, Route>>
  readonly driverNameById: Readonly<Record<string, string>>
  readonly customerNameById: Readonly<Record<string, string>>
}

function regionMatches(
  regions: readonly RegionId[],
  candidates: readonly (RegionId | null | undefined)[]
): boolean {
  if (regions.length === 0) {
    return true
  }
  return candidates.some(
    (candidate) => candidate != null && regions.includes(candidate)
  )
}

/**
 * Vehicle predicate. A vehicle counts as "in" a region if it is working a route
 * that touches it or is based there, which is how a dispatcher thinks about
 * territory — not where the truck happens to be standing this second.
 */
export function matchesVehicleFilters(
  vehicle: Vehicle,
  filters: OperationsFilters,
  context: FilterContext
): boolean {
  if (filters.vehicleStatus !== "ALL" && vehicle.status !== filters.vehicleStatus) {
    return false
  }

  const route = vehicle.routeId ? context.routesById[vehicle.routeId] : undefined
  if (
    !regionMatches(filters.regions, [
      vehicle.homeRegion,
      route?.originRegion,
      route?.destinationRegion,
    ])
  ) {
    return false
  }

  const query = filters.query.trim().toLowerCase()
  if (query.length === 0) {
    return true
  }

  const driver = context.driverNameById[vehicle.driverId] ?? ""
  return (
    vehicle.callSign.toLowerCase().includes(query) ||
    vehicle.plateNumber.toLowerCase().includes(query) ||
    vehicle.type.toLowerCase().includes(query) ||
    driver.toLowerCase().includes(query)
  )
}

export function matchesDeliveryFilters(
  delivery: Delivery,
  filters: OperationsFilters,
  context: FilterContext
): boolean {
  if (
    filters.deliveryStatus !== "ALL" &&
    delivery.status !== filters.deliveryStatus
  ) {
    return false
  }

  if (
    !regionMatches(filters.regions, [
      delivery.originRegion,
      delivery.destinationRegion,
    ])
  ) {
    return false
  }

  const query = filters.query.trim().toLowerCase()
  if (query.length === 0) {
    return true
  }

  const customer = context.customerNameById[delivery.customerId] ?? ""
  const driver = delivery.driverId
    ? (context.driverNameById[delivery.driverId] ?? "")
    : ""

  return (
    delivery.reference.toLowerCase().includes(query) ||
    customer.toLowerCase().includes(query) ||
    driver.toLowerCase().includes(query)
  )
}

export interface DeliveryRow {
  readonly delivery: Delivery
  readonly customerName: string
  readonly driverName: string
  readonly vehicleCallSign: string
  readonly originName: string
  readonly destinationName: string
}

/** Ranked so sorting by priority puts the most urgent consignment first. */
const PRIORITY_RANK: Readonly<Record<Delivery["priority"], number>> = {
  CRITICAL: 2,
  EXPRESS: 1,
  STANDARD: 0,
}

/** Comparator factory for the delivery table. */
export function compareDeliveryRows(
  column: DeliveryColumnId,
  direction: SortDirection
): (a: DeliveryRow, b: DeliveryRow) => number {
  const sign = direction === "asc" ? 1 : -1

  return (a, b) => {
    switch (column) {
      case "reference":
        return sign * a.delivery.reference.localeCompare(b.delivery.reference)
      case "customer":
        return sign * a.customerName.localeCompare(b.customerName)
      case "origin":
        return sign * a.originName.localeCompare(b.originName)
      case "destination":
        return sign * a.destinationName.localeCompare(b.destinationName)
      case "driver":
        return sign * a.driverName.localeCompare(b.driverName)
      case "vehicle":
        return (
          sign *
          a.vehicleCallSign.localeCompare(b.vehicleCallSign, undefined, {
            numeric: true,
          })
        )
      case "priority":
        // Ties break on delay, so the worst of the critical runs leads.
        return (
          sign *
            (PRIORITY_RANK[a.delivery.priority] -
              PRIORITY_RANK[b.delivery.priority]) ||
          sign * (a.delivery.delayMinutes - b.delivery.delayMinutes)
        )
      case "region":
        return (
          sign *
          a.delivery.destinationRegion.localeCompare(
            b.delivery.destinationRegion
          )
        )
      case "status":
        return sign * a.delivery.status.localeCompare(b.delivery.status)
      case "delay":
        return sign * (a.delivery.delayMinutes - b.delivery.delayMinutes)
      case "eta":
      default:
        return sign * (a.delivery.etaAt - b.delivery.etaAt)
    }
  }
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): { readonly rows: readonly T[]; readonly page: number; readonly pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(0, page), pageCount - 1)
  const start = safePage * pageSize
  return {
    rows: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
  }
}

export function hasActiveFilters(filters: OperationsFilters): boolean {
  return (
    filters.vehicleStatus !== "ALL" ||
    filters.deliveryStatus !== "ALL" ||
    filters.regions.length > 0 ||
    filters.query.trim().length > 0
  )
}

export function describeFilters(
  vehicleStatus: VehicleStatusFilter,
  deliveryStatus: DeliveryStatusFilter,
  regions: readonly RegionId[]
): number {
  return (
    (vehicleStatus === "ALL" ? 0 : 1) +
    (deliveryStatus === "ALL" ? 0 : 1) +
    regions.length
  )
}
