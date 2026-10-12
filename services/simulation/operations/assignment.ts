import { etaFromRemaining } from "@/lib/calculations"
import { resolveProgress } from "@/lib/routing"
import { appendTimeline, timelineEntry } from "@/lib/timeline"
import type { DeliveryPriority, Vehicle } from "@/types"
import type { Emit } from "../emit"
import { requireRoute, type World } from "../world"
import { speedForRoute } from "./deliveries"

export interface ReassignResult {
  readonly deliveryId: string
  readonly fromVehicleId: string | null
  readonly toVehicleId: string
}

/** Vehicles a delivery can legally be handed to, in deadhead order. */
export function candidateVehiclesFor(
  world: World,
  deliveryId: string,
  limit = 12
): readonly Vehicle[] {
  const delivery = world.deliveries.get(deliveryId)
  if (!delivery) {
    return []
  }

  const route = world.routes.get(delivery.routeId)
  if (!route) {
    return []
  }

  const progress = resolveProgress(
    route,
    Math.max(0, route.totalDistanceKm - delivery.remainingKm)
  )

  const candidates: { vehicle: Vehicle; distance: number }[] = []
  for (const vehicleId of world.idleVehicleIds) {
    const vehicle = world.vehicles.get(vehicleId)
    // An offline truck cannot take work, and handing a delivery to the vehicle
    // already carrying it is a no-op the operator should not be offered.
    if (!vehicle || vehicle.status === "OFFLINE" || vehicle.id === delivery.vehicleId) {
      continue
    }

    const latDelta = vehicle.location.lat - progress.position.lat
    const lngDelta = vehicle.location.lng - progress.position.lng
    candidates.push({
      vehicle,
      distance: latDelta * latDelta + lngDelta * lngDelta,
    })
  }

  candidates.sort((a, b) => a.distance - b.distance)
  return candidates.slice(0, limit).map((entry) => entry.vehicle)
}

/**
 * Hands a live delivery to a different vehicle.
 *
 * Modelled as a transfer rather than a restart: the consignment keeps the
 * distance it has already covered, and the new vehicle picks it up at that
 * point on the corridor. Resetting progress would be easier and would lie —
 * the goods do not travel back to the depot because a dispatcher changed their
 * mind about who is driving.
 */
export function reassignDelivery(
  world: World,
  emit: Emit,
  deliveryId: string,
  toVehicleId: string,
  reason: string
): ReassignResult | null {
  const delivery = world.deliveries.get(deliveryId)
  const target = world.vehicles.get(toVehicleId)
  const targetKin = world.kinematics.get(toVehicleId)

  if (!delivery || !target || !targetKin || target.status === "OFFLINE") {
    return null
  }
  if (delivery.vehicleId === toVehicleId) {
    return null
  }

  const now = world.clock.now()
  const route = requireRoute(world, delivery.routeId)
  const travelledKm = Math.max(0, route.totalDistanceKm - delivery.remainingKm)
  const progress = resolveProgress(route, travelledKm)
  const speed = speedForRoute(world, route, targetKin.jitter)
  const etaAt = etaFromRemaining(now, delivery.remainingKm, speed)

  const fromVehicleId = delivery.vehicleId
  const previous = fromVehicleId ? world.vehicles.get(fromVehicleId) : undefined

  // Release the outgoing vehicle back to the idle pool.
  if (previous) {
    world.vehicles.set(previous.id, {
      ...previous,
      status: "IDLE",
      routeId: null,
      deliveryId: null,
      speed: 0,
      lastSeen: now,
    })
    const previousKin = world.kinematics.get(previous.id)
    if (previousKin) {
      previousKin.routeId = null
      previousKin.travelledKm = 0
      previousKin.speed = 0
      previousKin.stoppedUntil = null
    }
    world.idleVehicleIds.add(previous.id)

    emit("vehicle.status.changed", {
      vehicleId: previous.id,
      from: previous.status,
      to: "IDLE",
      reason: `Released from delivery #${delivery.reference}`,
    })
  }

  world.idleVehicleIds.delete(toVehicleId)
  world.vehicles.set(toVehicleId, {
    ...target,
    status: "ON_ROUTE",
    routeId: route.id,
    deliveryId,
    location: progress.position,
    heading: progress.bearing,
    speed,
    lastSeen: now,
  })

  targetKin.routeId = route.id
  targetKin.travelledKm = travelledKm
  targetKin.speed = speed
  targetKin.heading = progress.bearing
  targetKin.stoppedUntil = null

  world.deliveries.set(deliveryId, {
    ...delivery,
    vehicleId: toVehicleId,
    driverId: target.driverId,
    etaAt,
    timeline: appendTimeline(
      delivery.timeline,
      timelineEntry({
        kind: "assigned",
        label: "Reassigned to another vehicle",
        at: now,
        detail: `${target.callSign} — ${target.plateNumber} · ${reason}`,
        state: "done",
      })
    ),
  })
  world.etaWatermarks.set(deliveryId, etaAt)

  emit("delivery.reassigned", {
    deliveryId,
    fromVehicleId,
    toVehicleId,
    driverId: target.driverId,
    reason,
  })
  emit("vehicle.status.changed", {
    vehicleId: toVehicleId,
    from: target.status,
    to: "ON_ROUTE",
    reason: `Took over delivery #${delivery.reference}`,
  })

  return { deliveryId, fromVehicleId, toVehicleId }
}

/**
 * Puts a cancelled delivery back on the road.
 *
 * This exists so cancellation can be undone, and it is restricted to
 * cancellation on purpose: a completed delivery has already been counted into
 * the day's throughput and the on-time rate, and reopening it would leave the
 * metrics describing a shift that did not happen. A cancelled one was never
 * counted, so reinstating it costs nothing but the timeline note saying so.
 */
export function restoreDelivery(
  world: World,
  emit: Emit,
  deliveryId: string,
  vehicleId: string
): boolean {
  const delivery = world.deliveries.get(deliveryId)
  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)

  if (!delivery || delivery.status !== "CANCELLED") {
    return false
  }
  if (!vehicle || !kin || vehicle.status === "OFFLINE" || vehicle.deliveryId) {
    return false
  }

  const now = world.clock.now()
  const route = requireRoute(world, delivery.routeId)
  const travelledKm = Math.max(0, route.totalDistanceKm - delivery.remainingKm)
  const progress = resolveProgress(route, travelledKm)
  const speed = speedForRoute(world, route, kin.jitter)
  const etaAt = etaFromRemaining(now, delivery.remainingKm, speed)

  world.idleVehicleIds.delete(vehicleId)
  world.vehicles.set(vehicleId, {
    ...vehicle,
    status: "ON_ROUTE",
    routeId: route.id,
    deliveryId,
    location: progress.position,
    heading: progress.bearing,
    speed,
    lastSeen: now,
  })

  kin.routeId = route.id
  kin.travelledKm = travelledKm
  kin.speed = speed
  kin.heading = progress.bearing
  kin.stoppedUntil = null

  world.deliveries.set(deliveryId, {
    ...delivery,
    status: "IN_TRANSIT",
    vehicleId,
    driverId: vehicle.driverId,
    etaAt,
    timeline: appendTimeline(
      delivery.timeline,
      timelineEntry({
        kind: "recovered",
        label: "Cancellation reversed",
        at: now,
        detail: `Back on the road with ${vehicle.callSign}`,
        state: "active",
      })
    ),
  })
  world.etaWatermarks.set(deliveryId, etaAt)

  emit("delivery.recovered", { deliveryId })
  emit("delivery.assigned", {
    deliveryId,
    vehicleId,
    driverId: vehicle.driverId,
  })
  emit("vehicle.status.changed", {
    vehicleId,
    from: vehicle.status,
    to: "ON_ROUTE",
    reason: `Reinstated delivery #${delivery.reference}`,
  })

  return true
}

/**
 * Re-grades a consignment. Priority does not change the physics — a CRITICAL
 * parcel is not driven faster — but it changes how the board sorts and how
 * loudly a breach is reported, which is what a re-grade is actually for.
 */
export function setDeliveryPriority(
  world: World,
  emit: Emit,
  deliveryId: string,
  priority: DeliveryPriority
): boolean {
  const delivery = world.deliveries.get(deliveryId)
  if (!delivery || delivery.priority === priority) {
    return false
  }

  const now = world.clock.now()

  world.deliveries.set(deliveryId, {
    ...delivery,
    priority,
    timeline: appendTimeline(
      delivery.timeline,
      timelineEntry({
        kind: "eta_revised",
        label: `Priority changed to ${priority.toLowerCase()}`,
        at: now,
        detail: `Was ${delivery.priority.toLowerCase()}`,
        state: "done",
      })
    ),
  })

  emit("delivery.priority.changed", {
    deliveryId,
    from: delivery.priority,
    to: priority,
  })

  return true
}
