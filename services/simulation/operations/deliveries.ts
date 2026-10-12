import { MINUTE_MS, minutesBetween } from "@/lib/clock"
import {
  delayFromEta,
  deriveDeliveryStatus,
  effectiveSpeed,
  etaFromRemaining,
  headroomMinutes,
} from "@/lib/calculations"
import { appendTimeline, closeTimeline, reviseArrival, timelineEntry } from "@/lib/timeline"
import { resolveProgress } from "@/lib/routing"
import type { Delivery, DeliveryStatus, Route } from "@/types"
import type { Emit } from "../emit"
import { requireRoute, type World } from "../world"
import { raiseAlert, resolveAlertsForDelivery } from "./records"

/** Beyond this, an ETA move is worth telling a dispatcher about. */
const ETA_REVISION_THRESHOLD_MINUTES = 6

export interface ProgressUpdate {
  readonly deliveryId: string
  readonly travelledKm: number
  readonly speed: number
  readonly cause: string
}

/**
 * Recomputes a delivery from its vehicle's position and publishes whatever
 * actually changed.
 *
 * This single function is where the headline propagation chain is implemented:
 * a slower speed produces a later ETA, a later ETA erodes the promise headroom,
 * and crossing a threshold moves the delivery into AT_RISK or DELAYED — which
 * in turn raises an alert. Nothing else in the codebase needs to know that
 * traffic and delivery status are related.
 */
export function applyProgress(
  world: World,
  emit: Emit,
  update: ProgressUpdate
): Delivery | null {
  const delivery = world.deliveries.get(update.deliveryId)
  if (!delivery) {
    return null
  }

  const route = requireRoute(world, delivery.routeId)
  const now = world.clock.now()
  const progress = resolveProgress(route, update.travelledKm)
  const etaAt = etaFromRemaining(now, progress.remainingKm, update.speed)
  const nextStatus = deriveDeliveryStatus({
    current: delivery.status,
    etaAt,
    promisedAt: delivery.promisedAt,
  })

  let timeline = delivery.timeline
  const watermark = world.etaWatermarks.get(delivery.id) ?? delivery.etaAt
  const etaDelta = minutesBetween(watermark, etaAt)

  if (Math.abs(etaDelta) >= ETA_REVISION_THRESHOLD_MINUTES) {
    world.etaWatermarks.set(delivery.id, etaAt)
    emit("delivery.eta.revised", {
      deliveryId: delivery.id,
      from: watermark,
      to: etaAt,
      deltaMinutes: Math.round(etaDelta),
      cause: update.cause,
    })
    timeline = reviseArrival(timeline, etaAt)
  }

  const next: Delivery = {
    ...delivery,
    status: nextStatus,
    etaAt,
    delayMinutes: delayFromEta(etaAt, delivery.promisedAt),
    progressFraction: progress.fraction,
    remainingKm: progress.remainingKm,
    timeline,
  }

  world.deliveries.set(next.id, next)
  emit("delivery.progress.updated", {
    deliveryId: next.id,
    progressFraction: next.progressFraction,
    remainingKm: next.remainingKm,
  })

  if (nextStatus !== delivery.status) {
    announceStatusChange(world, emit, delivery, next, update.cause)
  }

  return next
}

/** Publishes the consequence of a status transition: events, timeline, alerts. */
function announceStatusChange(
  world: World,
  emit: Emit,
  previous: Delivery,
  next: Delivery,
  cause: string
): void {
  const now = world.clock.now()

  if (next.status === "DELAYED") {
    emit("delivery.delayed", {
      deliveryId: next.id,
      delayMinutes: next.delayMinutes,
      cause,
      previousStatus: previous.status,
    })
    const entry = timelineEntry({
      kind: "delay",
      label: `Running ${next.delayMinutes} min behind`,
      at: now,
      detail: cause,
    })
    world.deliveries.set(next.id, {
      ...next,
      timeline: appendTimeline(next.timeline, entry),
    })
    emit("delivery.timeline.appended", { deliveryId: next.id, entry })
    raiseAlert(world, emit, {
      kind: "DELIVERY_DELAYED",
      severity: "WARNING",
      title: `Delivery #${next.reference} delayed`,
      message: `${cause} — now ${next.delayMinutes} minutes behind promise`,
      vehicleId: next.vehicleId,
      deliveryId: next.id,
      region: next.destinationRegion,
    })
    return
  }

  if (next.status === "AT_RISK") {
    const minutes = Math.round(headroomMinutes(next.etaAt, next.promisedAt))
    emit("delivery.at_risk", {
      deliveryId: next.id,
      cause,
      minutesToBreach: minutes,
    })
    raiseAlert(world, emit, {
      kind: "DELIVERY_AT_RISK",
      severity: "INFO",
      title: `Delivery #${next.reference} at risk`,
      message: `${minutes} minutes of headroom left — ${cause}`,
      vehicleId: next.vehicleId,
      deliveryId: next.id,
      region: next.destinationRegion,
    })
    return
  }

  if (next.status === "IN_TRANSIT" && previous.status !== "ASSIGNED") {
    emit("delivery.recovered", { deliveryId: next.id })
    const entry = timelineEntry({
      kind: "recovered",
      label: "Back on schedule",
      at: now,
      detail: cause,
    })
    world.deliveries.set(next.id, {
      ...next,
      timeline: appendTimeline(next.timeline, entry),
    })
    emit("delivery.timeline.appended", { deliveryId: next.id, entry })
    resolveAlertsForDelivery(world, emit, next.id, [
      "DELIVERY_DELAYED",
      "DELIVERY_AT_RISK",
      "ETA_BREACH",
    ])
  }
}

/**
 * Closes a delivery and releases its vehicle back to the idle pool, which is
 * what keeps the fleet churning: freed trucks become candidates for the next
 * generated order.
 */
export function completeDelivery(
  world: World,
  emit: Emit,
  deliveryId: string
): Delivery | null {
  const delivery = world.deliveries.get(deliveryId)
  if (!delivery || delivery.status === "COMPLETED") {
    return null
  }

  const now = world.clock.now()
  const route = requireRoute(world, delivery.routeId)
  const onTime = now <= delivery.promisedAt
  const entry = timelineEntry({
    kind: "arrival",
    label: "Delivered",
    at: now,
    detail: route.destination.name,
  })

  const next: Delivery = {
    ...delivery,
    status: "COMPLETED",
    completedAt: now,
    etaAt: now,
    progressFraction: 1,
    remainingKm: 0,
    delayMinutes: onTime ? 0 : delayFromEta(now, delivery.promisedAt),
    timeline: closeTimeline(delivery.timeline, entry),
  }

  world.deliveries.set(next.id, next)
  emit("delivery.completed", {
    deliveryId: next.id,
    completedAt: now,
    onTime,
    delayMinutes: next.delayMinutes,
  })
  resolveAlertsForDelivery(world, emit, next.id, [
    "DELIVERY_DELAYED",
    "DELIVERY_AT_RISK",
    "ETA_BREACH",
  ])

  if (delivery.vehicleId) {
    releaseVehicle(world, emit, delivery.vehicleId)
  }

  return next
}

/** Detaches a vehicle from its delivery and parks it where it stands. */
function releaseVehicle(
  world: World,
  emit: Emit,
  vehicleId: string
): void {
  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)
  if (!vehicle || !kin) {
    return
  }

  const from = vehicle.status
  world.vehicles.set(vehicleId, {
    ...vehicle,
    status: "IDLE",
    speed: 0,
    routeId: null,
    deliveryId: null,
    lastSeen: world.clock.now(),
  })

  kin.routeId = null
  kin.travelledKm = 0
  kin.speed = 0
  kin.stoppedUntil = null
  world.idleVehicleIds.add(vehicleId)

  if (from !== "IDLE") {
    emit("vehicle.status.changed", {
      vehicleId,
      from,
      to: "IDLE",
      reason: "Delivery closed out",
    })
  }
}

export function cancelDelivery(
  world: World,
  emit: Emit,
  deliveryId: string,
  reason: string
): Delivery | null {
  const delivery = world.deliveries.get(deliveryId)
  if (
    !delivery ||
    delivery.status === "COMPLETED" ||
    delivery.status === "CANCELLED"
  ) {
    return null
  }

  const now = world.clock.now()
  const entry = timelineEntry({
    kind: "cancelled",
    label: "Delivery cancelled",
    at: now,
    detail: reason,
  })

  const next: Delivery = {
    ...delivery,
    status: "CANCELLED",
    timeline: closeTimeline(delivery.timeline, entry),
  }

  world.deliveries.set(next.id, next)
  emit("delivery.cancelled", { deliveryId: next.id, reason })

  if (delivery.vehicleId) {
    releaseVehicle(world, emit, delivery.vehicleId)
  }

  return next
}

/** Baseline speed for a delivery's route under current traffic. */
export function speedForRoute(world: World, route: Route, jitter: number): number {
  const level = world.traffic.get(route.id)?.level ?? "normal"
  return effectiveSpeed(route.freeFlowSpeed, level, jitter)
}

