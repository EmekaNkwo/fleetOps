import { trafficFactor } from "@/lib/calculations"
import { appendTimeline, timelineEntry } from "@/lib/timeline"
import type { TrafficCondition, TrafficLevel } from "@/types"
import type { Emit } from "../emit"
import type { World } from "../world"
import { createIncident, raiseAlert } from "./records"

const ESCALATION: Readonly<Record<TrafficLevel, TrafficLevel>> = {
  normal: "slow",
  slow: "congested",
  congested: "congested",
}

const RECOVERY: Readonly<Record<TrafficLevel, TrafficLevel>> = {
  congested: "slow",
  slow: "normal",
  normal: "normal",
}

export const CONGESTION_CAUSES: readonly string[] = [
  "Tanker breakdown narrowing the carriageway",
  "Road works at the toll plaza",
  "Market-day congestion",
  "Articulated vehicle blocking the inside lane",
  "Flooding after heavy rainfall",
  "Security checkpoint queue",
  "Multi-vehicle collision being cleared",
]

export function escalate(level: TrafficLevel): TrafficLevel {
  return ESCALATION[level]
}

export function recover(level: TrafficLevel): TrafficLevel {
  return RECOVERY[level]
}

/** Vehicles currently driving the given route. */
function vehiclesOnRoute(world: World, routeId: string): string[] {
  const ids: string[] = []
  for (const kin of world.kinematics.values()) {
    if (kin.routeId === routeId) {
      ids.push(kin.vehicleId)
    }
  }
  return ids
}

/**
 * Applies a traffic condition to a route.
 *
 * This is the upstream end of the propagation chain. It changes one number —
 * the corridor's speed factor — and the movement tick turns that into slower
 * vehicles, later ETAs, at-risk deliveries and alerts, without any of those
 * subsystems being told about the traffic event directly.
 */
export function setTraffic(
  world: World,
  emit: Emit,
  input: {
    readonly routeId: string
    readonly level: TrafficLevel
    readonly description: string
  }
): TrafficCondition | null {
  const route = world.routes.get(input.routeId)
  const previous = world.traffic.get(input.routeId)
  if (!route || !previous || previous.level === input.level) {
    return null
  }

  const condition: TrafficCondition = {
    routeId: input.routeId,
    level: input.level,
    speedFactor: trafficFactor(input.level),
    since: world.clock.now(),
    description: input.description,
  }

  world.traffic.set(input.routeId, condition)
  const affectedVehicleIds = vehiclesOnRoute(world, input.routeId)
  const payload = {
    condition,
    previousLevel: previous.level,
    affectedVehicleIds,
  }

  const worsening =
    trafficFactor(input.level) < trafficFactor(previous.level)

  if (input.level === "congested") {
    emit("traffic.spike.detected", payload)
  } else if (input.level === "slow") {
    emit(worsening ? "traffic.slow" : "traffic.cleared", payload)
  } else {
    emit("traffic.normal", payload)
    emit("traffic.cleared", payload)
  }

  if (input.level === "congested") {
    raiseAlert(world, emit, {
      kind: "TRAFFIC_SPIKE",
      severity: "WARNING",
      title: `Traffic spike on ${route.name}`,
      message: `${input.description} — ${affectedVehicleIds.length} vehicles affected`,
      region: route.destinationRegion,
    })

    createIncident(world, emit, {
      type: "TRAFFIC",
      title: `Congestion on ${route.name}`,
      description: input.description,
      routeId: route.id,
      region: route.destinationRegion,
    })

    annotateAffectedDeliveries(world, emit, affectedVehicleIds, input.description)
  }

  return condition
}

/** Writes the traffic event onto the timeline of every delivery it touches. */
function annotateAffectedDeliveries(
  world: World,
  emit: Emit,
  vehicleIds: readonly string[],
  description: string
): void {
  const now = world.clock.now()

  for (const vehicleId of vehicleIds) {
    const vehicle = world.vehicles.get(vehicleId)
    if (!vehicle?.deliveryId) {
      continue
    }
    const delivery = world.deliveries.get(vehicle.deliveryId)
    if (!delivery) {
      continue
    }

    const entry = timelineEntry({
      kind: "traffic",
      label: "Traffic detected",
      at: now,
      detail: description,
    })
    world.deliveries.set(delivery.id, {
      ...delivery,
      timeline: appendTimeline(delivery.timeline, entry),
    })
    emit("delivery.timeline.appended", { deliveryId: delivery.id, entry })
  }
}
