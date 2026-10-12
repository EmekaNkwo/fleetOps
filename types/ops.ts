import type { RegionId } from "./geo"

export type Severity = "INFO" | "WARNING" | "CRITICAL"

export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED"

export type AlertKind =
  | "VEHICLE_OFFLINE"
  | "DELIVERY_DELAYED"
  | "DELIVERY_AT_RISK"
  | "ETA_BREACH"
  | "TRAFFIC_SPIKE"
  | "VEHICLE_FAILURE"
  | "DELIVERY_CANCELLED"
  | "FUEL_LOW"
  | "GEOFENCE_BREACH"

export interface Alert {
  readonly id: string
  readonly kind: AlertKind
  readonly severity: Severity
  readonly title: string
  readonly message: string
  readonly status: AlertStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly vehicleId: string | null
  readonly deliveryId: string | null
  readonly incidentId: string | null
  readonly region: RegionId | null
}

export type IncidentType =
  | "TRAFFIC"
  | "MECHANICAL"
  | "ACCIDENT"
  | "WEATHER"
  | "SECURITY"
  | "CUSTOMER"

export type IncidentStatus =
  | "DETECTED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "RESOLVED"

export interface IncidentLogEntry {
  readonly at: number
  readonly status: IncidentStatus
  readonly note: string
  readonly actor: string
}

export interface Incident {
  readonly id: string
  readonly reference: string
  readonly type: IncidentType
  readonly severity: Severity
  readonly status: IncidentStatus
  readonly title: string
  readonly description: string
  readonly vehicleId: string | null
  readonly deliveryId: string | null
  readonly routeId: string | null
  readonly region: RegionId | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly resolvedAt: number | null
  readonly assignee: string | null
  readonly log: readonly IncidentLogEntry[]
}

/** One line in the live activity stream. */
export interface ActivityEvent {
  readonly id: string
  readonly at: number
  readonly type: string
  readonly severity: Severity
  readonly message: string
  readonly vehicleId: string | null
  readonly deliveryId: string | null
}

export interface OperationsMetrics {
  readonly activeDeliveries: number
  readonly inTransit: number
  readonly deliveredToday: number
  readonly delayed: number
  readonly atRisk: number
  readonly vehiclesOnline: number
  readonly vehiclesOffline: number
  /** Share of deliveries whose live ETA is within tolerance of dispatch ETA. */
  readonly etaAccuracy: number
  readonly onTimeRate: number
  readonly fleetUtilisation: number
  readonly fleetAvailability: number
  readonly averageDelayMinutes: number
  readonly averageDeliveryMinutes: number
  readonly deliveriesPerHour: number
  readonly openIncidents: number
  readonly openAlerts: number
}

/** A point in a rolling time series used by the analytics charts. */
export interface MetricSample {
  readonly at: number
  readonly label: string
  readonly completed: number
  readonly delayed: number
  readonly inTransit: number
  readonly onTimeRate: number
  readonly averageDelayMinutes: number
  readonly etaAccuracy: number
}

export type TrendDirection = "up" | "down" | "flat"

export interface MetricTrend {
  readonly direction: TrendDirection
  readonly delta: number
  /** Whether movement in this direction is operationally good. */
  readonly polarity: "good" | "bad" | "neutral"
  readonly since: string
}
