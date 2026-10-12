import type { Customer, Delivery } from "./delivery"
import type { Driver, Vehicle } from "./fleet"
import type { Route, TrafficCondition } from "./route"
import type { Alert, ActivityEvent, Incident } from "./ops"

export type EventRate = "slow" | "normal" | "fast"

export interface SimulationToggles {
  readonly randomDelays: boolean
  readonly vehicleFailures: boolean
  readonly trafficSpikes: boolean
  readonly newDeliveries: boolean
  readonly deliveryCompletions: boolean
}

export interface SimulationConfig {
  readonly rate: EventRate
  readonly toggles: SimulationToggles
}

export interface SimulationStatus {
  readonly running: boolean
  readonly tick: number
  readonly startedAt: number | null
  readonly eventsEmitted: number
  readonly lastEventAt: number | null
}

/** The immutable snapshot the mock API hands to the stores on bootstrap. */
export interface OperationsSnapshot {
  readonly generatedAt: number
  readonly routes: readonly Route[]
  readonly drivers: readonly Driver[]
  readonly customers: readonly Customer[]
  readonly vehicles: readonly Vehicle[]
  readonly deliveries: readonly Delivery[]
  readonly incidents: readonly Incident[]
  readonly alerts: readonly Alert[]
  readonly activity: readonly ActivityEvent[]
  readonly traffic: readonly TrafficCondition[]
}
