import type { RegionId } from "./geo"
import type { DeliveryStatus } from "./delivery"
import type { VehicleStatus } from "./fleet"
import type { DriverStatus } from "./fleet"
import type { Severity } from "./ops"

export type VehicleStatusFilter = VehicleStatus | "ALL"
export type DriverStatusFilter = DriverStatus | "ALL"
export type DeliveryStatusFilter = DeliveryStatus | "ALL"
export type SeverityFilter = Severity | "ALL"

export interface OperationsFilters {
  readonly vehicleStatus: VehicleStatusFilter
  readonly deliveryStatus: DeliveryStatusFilter
  readonly regions: readonly RegionId[]
  readonly query: string
}

export type SidePanel =
  | "alerts"
  | "incidents"
  | "fuel"
  | "zones"
  | "settings"
  | "simulation"
  | "shortcuts"
  | null

export type WorkspaceTab =
  | "map"
  | "deliveries"
  | "drivers"
  | "routes"
  | "analytics"

export type SelectionKind = "vehicle" | "delivery" | "incident" | "driver"

export interface Selection {
  readonly kind: SelectionKind
  readonly id: string
}

export type SearchResultKind =
  | "vehicle"
  | "driver"
  | "delivery"
  | "customer"
  | "route"

export interface SearchResult {
  readonly kind: SearchResultKind
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly score: number
}

export interface SearchResultGroup {
  readonly kind: SearchResultKind
  readonly label: string
  readonly results: readonly SearchResult[]
}

export type SortDirection = "asc" | "desc"

export type DeliveryColumnId =
  | "reference"
  | "customer"
  | "priority"
  | "origin"
  | "destination"
  | "region"
  | "driver"
  | "vehicle"
  | "status"
  | "eta"
  | "delay"

export type DriverColumnId =
  | "name"
  | "status"
  | "region"
  | "vehicle"
  | "active"
  | "delayed"
  | "completed"
  | "rating"

export type RouteColumnId =
  | "name"
  | "origin"
  | "destination"
  | "distance"
  | "traffic"
  | "speed"
  | "vehicles"
  | "deliveries"
  | "delayed"
  /** The trailing action cell. Never sorted, but needs a stable key. */
  | "actions"

/** Shared shape for the sortable, paginated tables outside the board. */
export interface TableViewState<TColumn extends string> {
  readonly sortBy: TColumn
  readonly sortDirection: SortDirection
  readonly page: number
  readonly pageSize: number
}

export interface FleetListState {
  readonly page: number
  readonly pageSize: number
}

export interface DeliveryTableState {
  readonly sortBy: DeliveryColumnId
  readonly sortDirection: SortDirection
  readonly page: number
  readonly pageSize: number
  readonly hiddenColumns: readonly DeliveryColumnId[]
  readonly selectedIds: readonly string[]
}
