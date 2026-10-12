import type { ActivityEvent, AnyDomainEvent, Severity } from "@/types"

/**
 * Resolves ids to the labels an operator recognises. Injected rather than
 * imported so message building stays a pure function of the event plus a
 * lookup — which makes it trivial to test and impossible to couple to a store.
 */
export interface ActivityLookup {
  vehicleCallSign(vehicleId: string): string
  deliveryReference(deliveryId: string): string
  routeName(routeId: string): string
}

/**
 * Event names that are too high-frequency to belong in a human-readable feed.
 * Position fixes arrive hundreds of times a second; they are shown for the
 * vehicle the operator has selected and suppressed for everything else.
 */
const SUPPRESSED = new Set<string>([
  "delivery.progress.updated",
  "simulation.tick",
])

const SEVERITY_BY_EVENT: Readonly<Record<string, Severity>> = {
  "vehicle.offline": "CRITICAL",
  "incident.created": "CRITICAL",
  "alert.raised": "WARNING",
  "delivery.delayed": "WARNING",
  "delivery.at_risk": "WARNING",
  "delivery.cancelled": "WARNING",
  "traffic.spike.detected": "WARNING",
  "traffic.slow": "WARNING",
  "vehicle.stopped": "WARNING",
  "vehicle.fuel.low": "WARNING",
  "geofence.breached": "WARNING",
  "simulation.error": "CRITICAL",
}

export interface ActivityOptions {
  /** Location updates are only logged for this vehicle, if any. */
  readonly focusVehicleId: string | null
}

/**
 * Turns a domain event into an activity line, or `null` when the event is not
 * worth a line. The feed is a projection of the event stream — it subscribes to
 * the bus and knows nothing about the simulation that produced it.
 */
export function toActivityEvent(
  event: AnyDomainEvent,
  lookup: ActivityLookup,
  options: ActivityOptions
): ActivityEvent | null {
  if (SUPPRESSED.has(event.name)) {
    return null
  }

  const base = {
    id: event.id,
    at: event.at,
    type: event.name,
    severity: SEVERITY_BY_EVENT[event.name] ?? "INFO",
  } as const

  switch (event.name) {
    case "vehicle.location.updated": {
      if (event.payload.vehicleId !== options.focusVehicleId) {
        return null
      }
      const route = event.payload.routeId
        ? lookup.routeName(event.payload.routeId)
        : "its route"
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} position updated on ${route} at ${Math.round(event.payload.speed)} km/h`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }
    }

    case "vehicle.speed.changed":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} ${event.payload.to < event.payload.from ? "slowed" : "sped up"} ${event.payload.from} → ${event.payload.to} km/h · ${event.payload.cause}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "vehicle.status.changed":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} ${event.payload.from.toLowerCase().replace("_", " ")} → ${event.payload.to.toLowerCase().replace("_", " ")}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "vehicle.stopped":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} stopped — ${event.payload.reason ?? "unknown reason"}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "vehicle.offline":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} went offline — ${event.payload.reason ?? "no telemetry"}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "vehicle.online":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} back online — ${event.payload.reason ?? "telemetry restored"}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "vehicle.fuel.low":
      return {
        ...base,
        message: `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} fuel at ${Math.round(event.payload.fuelLevel)}%`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "delivery.created":
      return {
        ...base,
        message: `Delivery #${event.payload.delivery.reference} created`,
        vehicleId: null,
        deliveryId: event.payload.delivery.id,
      }

    case "delivery.assigned":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} assigned to vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.started":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} departed origin`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.eta.revised":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} ETA ${event.payload.deltaMinutes > 0 ? "pushed back" : "pulled forward"} by ${Math.abs(event.payload.deltaMinutes)} min · ${event.payload.cause}`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.delayed":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} delayed by ${event.payload.delayMinutes} min · ${event.payload.cause}`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.at_risk":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} at risk — ${event.payload.minutesToBreach} min of headroom`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.recovered":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} back on schedule`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.completed":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} completed ${event.payload.onTime ? "on time" : `${event.payload.delayMinutes} min late`}`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.cancelled":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} cancelled — ${event.payload.reason}`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.reassigned":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} reassigned to ${lookup.vehicleCallSign(event.payload.toVehicleId)} — ${event.payload.reason}`,
        vehicleId: event.payload.toVehicleId,
        deliveryId: event.payload.deliveryId,
      }

    case "delivery.priority.changed":
      return {
        ...base,
        message: `Delivery #${lookup.deliveryReference(event.payload.deliveryId)} re-graded ${event.payload.from.toLowerCase()} → ${event.payload.to.toLowerCase()}`,
        vehicleId: null,
        deliveryId: event.payload.deliveryId,
      }

    case "geofence.breached":
      return {
        ...base,
        message:
          event.payload.trigger === "dwell"
            ? `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} held in ${event.payload.zoneName} for ${Math.round(event.payload.dwellMinutes)} min`
            : `Vehicle ${lookup.vehicleCallSign(event.payload.vehicleId)} ${event.payload.trigger === "enter" ? "entered" : "left"} ${event.payload.zoneName}`,
        vehicleId: event.payload.vehicleId,
        deliveryId: null,
      }

    case "delivery.timeline.appended":
      return null

    case "traffic.spike.detected":
      return {
        ...base,
        message: `Traffic spike detected on ${lookup.routeName(event.payload.condition.routeId)} — ${event.payload.affectedVehicleIds.length} vehicles affected`,
        vehicleId: null,
        deliveryId: null,
      }

    case "traffic.slow":
      return {
        ...base,
        message: `Slow moving traffic on ${lookup.routeName(event.payload.condition.routeId)} — ${event.payload.condition.description}`,
        vehicleId: null,
        deliveryId: null,
      }

    case "traffic.cleared":
    case "traffic.normal":
      return {
        ...base,
        message: `Traffic easing on ${lookup.routeName(event.payload.condition.routeId)}`,
        vehicleId: null,
        deliveryId: null,
      }

    case "incident.created":
      return {
        ...base,
        message: `Incident ${event.payload.incident.reference} opened — ${event.payload.incident.title}`,
        vehicleId: event.payload.incident.vehicleId,
        deliveryId: event.payload.incident.deliveryId,
      }

    case "incident.acknowledged":
    case "incident.investigating":
    case "incident.resolved":
      return {
        ...base,
        message: `Incident ${event.payload.incidentId} ${event.payload.to.toLowerCase()} by ${event.payload.actor}`,
        vehicleId: null,
        deliveryId: null,
      }

    case "incident.assigned":
      return {
        ...base,
        message: `Incident assigned to ${event.payload.assignee}`,
        vehicleId: null,
        deliveryId: null,
      }

    case "alert.raised":
      return {
        ...base,
        severity: event.payload.alert.severity,
        message: event.payload.alert.title,
        vehicleId: event.payload.alert.vehicleId,
        deliveryId: event.payload.alert.deliveryId,
      }

    case "alert.acknowledged":
    case "alert.dismissed":
    case "alert.resolved":
      return null

    case "simulation.started":
      return {
        ...base,
        message: "Simulation started — live telemetry streaming",
        vehicleId: null,
        deliveryId: null,
      }

    case "simulation.paused":
      return {
        ...base,
        message: "Simulation paused — telemetry frozen",
        vehicleId: null,
        deliveryId: null,
      }

    case "simulation.reset":
      return {
        ...base,
        message: "Simulation reset to the opening dataset",
        vehicleId: null,
        deliveryId: null,
      }

    case "simulation.error":
      return {
        ...base,
        message: `Event processing failed in ${event.payload.scope}: ${event.payload.message}`,
        vehicleId: null,
        deliveryId: null,
      }

    default:
      return null
  }
}
