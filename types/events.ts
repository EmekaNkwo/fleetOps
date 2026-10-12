import type { Location } from "./geo"
import type {
  Delivery,
  DeliveryPriority,
  DeliveryStatus,
  TimelineEntry,
} from "./delivery"
import type { Vehicle, VehicleStatus } from "./fleet"
import type { GeofenceBreachPayload } from "./geofence"
import type { Alert, Incident, IncidentStatus, Severity } from "./ops"
import type { TrafficCondition, TrafficLevel } from "./route"

/**
 * The event catalogue is the single contract between the simulation engine and
 * everything downstream. Stores and UI subscribe to these names; nothing
 * subscribes to the engine itself.
 */
export interface DomainEventMap {
  "vehicle.location.updated": VehicleLocationPayload
  "vehicle.speed.changed": VehicleSpeedPayload
  "vehicle.status.changed": VehicleStatusPayload
  "vehicle.stopped": VehicleRefPayload
  "vehicle.offline": VehicleRefPayload
  "vehicle.online": VehicleRefPayload
  "vehicle.fuel.low": VehicleFuelPayload

  "delivery.created": DeliveryCreatedPayload
  "delivery.assigned": DeliveryAssignedPayload
  "delivery.started": DeliveryRefPayload
  "delivery.progress.updated": DeliveryProgressPayload
  "delivery.eta.revised": DeliveryEtaPayload
  "delivery.delayed": DeliveryDelayPayload
  "delivery.at_risk": DeliveryRiskPayload
  "delivery.recovered": DeliveryRefPayload
  "delivery.completed": DeliveryCompletedPayload
  "delivery.cancelled": DeliveryCancelledPayload
  "delivery.timeline.appended": DeliveryTimelinePayload
  "delivery.reassigned": DeliveryReassignedPayload
  "delivery.priority.changed": DeliveryPriorityPayload

  "traffic.normal": TrafficPayload
  "traffic.slow": TrafficPayload
  "traffic.spike.detected": TrafficPayload
  "traffic.cleared": TrafficPayload

  "incident.created": IncidentPayload
  "incident.acknowledged": IncidentTransitionPayload
  "incident.assigned": IncidentAssignedPayload
  "incident.investigating": IncidentTransitionPayload
  "incident.resolved": IncidentTransitionPayload

  "geofence.breached": GeofenceBreachPayload

  "alert.raised": AlertPayload
  "alert.acknowledged": AlertRefPayload
  "alert.dismissed": AlertRefPayload
  "alert.resolved": AlertRefPayload

  "simulation.started": SimulationLifecyclePayload
  "simulation.paused": SimulationLifecyclePayload
  "simulation.reset": SimulationLifecyclePayload
  "simulation.tick": SimulationTickPayload
  "simulation.error": SimulationErrorPayload
}

export type DomainEventName = keyof DomainEventMap

/** Envelope delivered to subscribers. */
export interface DomainEvent<N extends DomainEventName = DomainEventName> {
  readonly id: string
  readonly name: N
  readonly at: number
  readonly payload: DomainEventMap[N]
}

export type AnyDomainEvent = {
  [N in DomainEventName]: DomainEvent<N>
}[DomainEventName]

export interface VehicleRefPayload {
  readonly vehicleId: string
  readonly reason?: string
}

export interface VehicleLocationPayload {
  readonly vehicleId: string
  readonly location: Location
  readonly heading: number
  readonly speed: number
  readonly routeId: string | null
  readonly travelledKm: number
}

export interface VehicleSpeedPayload {
  readonly vehicleId: string
  readonly from: number
  readonly to: number
  readonly cause: string
}

export interface VehicleStatusPayload {
  readonly vehicleId: string
  readonly from: VehicleStatus
  readonly to: VehicleStatus
  readonly reason: string
}

export interface VehicleFuelPayload {
  readonly vehicleId: string
  readonly fuelLevel: number
}

export interface DeliveryRefPayload {
  readonly deliveryId: string
}

export interface DeliveryCreatedPayload {
  readonly delivery: Delivery
}

export interface DeliveryAssignedPayload {
  readonly deliveryId: string
  readonly vehicleId: string
  readonly driverId: string
}

export interface DeliveryProgressPayload {
  readonly deliveryId: string
  readonly progressFraction: number
  readonly remainingKm: number
}

export interface DeliveryEtaPayload {
  readonly deliveryId: string
  readonly from: number
  readonly to: number
  readonly deltaMinutes: number
  readonly cause: string
}

export interface DeliveryDelayPayload {
  readonly deliveryId: string
  readonly delayMinutes: number
  readonly cause: string
  readonly previousStatus: DeliveryStatus
}

export interface DeliveryRiskPayload {
  readonly deliveryId: string
  readonly cause: string
  readonly minutesToBreach: number
}

export interface DeliveryCompletedPayload {
  readonly deliveryId: string
  readonly completedAt: number
  readonly onTime: boolean
  readonly delayMinutes: number
}

export interface DeliveryCancelledPayload {
  readonly deliveryId: string
  readonly reason: string
}

export interface DeliveryTimelinePayload {
  readonly deliveryId: string
  readonly entry: TimelineEntry
}

export interface TrafficPayload {
  readonly condition: TrafficCondition
  readonly previousLevel: TrafficLevel
  readonly affectedVehicleIds: readonly string[]
}

export interface DeliveryReassignedPayload {
  readonly deliveryId: string
  readonly fromVehicleId: string | null
  readonly toVehicleId: string
  readonly driverId: string
  readonly reason: string
}

export interface DeliveryPriorityPayload {
  readonly deliveryId: string
  readonly from: DeliveryPriority
  readonly to: DeliveryPriority
}

export interface IncidentPayload {
  readonly incident: Incident
}

export interface IncidentTransitionPayload {
  readonly incidentId: string
  readonly from: IncidentStatus
  readonly to: IncidentStatus
  readonly note: string
  readonly actor: string
}

export interface IncidentAssignedPayload {
  readonly incidentId: string
  readonly assignee: string
}

export interface AlertPayload {
  readonly alert: Alert
}

export interface AlertRefPayload {
  readonly alertId: string
}

export interface SimulationLifecyclePayload {
  readonly at: number
  readonly reason?: string
}

export interface SimulationTickPayload {
  readonly tick: number
  readonly at: number
  readonly emitted: number
}

export interface SimulationErrorPayload {
  readonly message: string
  readonly scope: string
}

/** Simulation-facing union used by the scheduler when queueing work. */
export type SimulationEventKind =
  | "movement"
  | "traffic"
  | "delay"
  | "vehicle_failure"
  | "new_delivery"
  | "delivery_completion"
  | "recovery"

export interface SimulationEvent {
  readonly kind: SimulationEventKind
  readonly at: number
  readonly severity: Severity
}
