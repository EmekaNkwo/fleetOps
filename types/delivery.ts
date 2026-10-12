import type { RegionId } from "./geo"

export type DeliveryStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "DELAYED"
  | "AT_RISK"
  | "COMPLETED"
  | "CANCELLED"

export type DeliveryPriority = "STANDARD" | "EXPRESS" | "CRITICAL"

export type TimelineEntryKind =
  | "created"
  | "assigned"
  | "pickup"
  | "departed"
  | "in_transit"
  | "traffic"
  | "delay"
  | "incident"
  | "eta_revised"
  | "recovered"
  | "arrival"
  | "cancelled"

export type TimelineEntryState = "done" | "active" | "upcoming"

export interface TimelineEntry {
  readonly id: string
  readonly kind: TimelineEntryKind
  readonly label: string
  readonly detail?: string
  readonly at: number
  readonly state: TimelineEntryState
}

export interface Customer {
  readonly id: string
  readonly name: string
  readonly contact: string
  readonly phone: string
  readonly region: RegionId
}

export interface Delivery {
  readonly id: string
  /** Human reference, e.g. "DEL-28492". */
  readonly reference: string
  readonly status: DeliveryStatus
  readonly priority: DeliveryPriority
  readonly customerId: string
  readonly vehicleId: string | null
  readonly driverId: string | null
  readonly routeId: string
  readonly originRegion: RegionId
  readonly destinationRegion: RegionId
  readonly weightKg: number
  readonly createdAt: number
  readonly startedAt: number | null
  readonly completedAt: number | null
  /** Contractual promise shown to the customer. */
  readonly promisedAt: number
  /** Current live estimate. */
  readonly etaAt: number
  /** Estimate at dispatch time, kept to measure ETA accuracy. */
  readonly originalEtaAt: number
  readonly delayMinutes: number
  readonly progressFraction: number
  readonly remainingKm: number
  readonly timeline: readonly TimelineEntry[]
}

export interface DeliveryCounts {
  readonly total: number
  readonly pending: number
  readonly assigned: number
  readonly inTransit: number
  readonly delayed: number
  readonly atRisk: number
  readonly completedToday: number
  readonly cancelled: number
}
