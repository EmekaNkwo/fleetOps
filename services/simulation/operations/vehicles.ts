import { MINUTE_MS } from "@/lib/clock"
import { deriveVehicleStatus } from "@/lib/calculations"
import { appendTimeline, timelineEntry } from "@/lib/timeline"
import type { VehicleStatus } from "@/types"
import type { Emit } from "../emit"
import { alertThresholds } from "../thresholds"
import type { World } from "../world"
import { createIncident, minutesSince, raiseAlert, transitionIncident } from "./records"

/**
 * Drops a vehicle off the network: telemetry stops, an incident is opened and a
 * critical alert is raised. The delivery it carries keeps its last known ETA and
 * slides into DELAYED on its own as the clock advances — which is exactly what
 * happens in a real control room.
 */
export function takeVehicleOffline(
  world: World,
  emit: Emit,
  vehicleId: string,
  reason: string,
  outageMinutes: number
): void {
  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)
  if (!vehicle || !kin || vehicle.status === "OFFLINE") {
    return
  }

  const now = world.clock.now()
  const from = vehicle.status

  world.vehicles.set(vehicleId, {
    ...vehicle,
    status: "OFFLINE",
    speed: 0,
    lastSeen: now,
  })
  kin.speed = 0
  kin.offlineUntil = now + outageMinutes * MINUTE_MS

  emit("vehicle.offline", { vehicleId, reason })
  emit("vehicle.status.changed", { vehicleId, from, to: "OFFLINE", reason })

  const route = vehicle.routeId ? world.routes.get(vehicle.routeId) : undefined
  const incident = createIncident(world, emit, {
    type: "MECHANICAL",
    title: `Vehicle ${vehicle.callSign} lost connectivity`,
    description: reason,
    vehicleId,
    deliveryId: vehicle.deliveryId,
    routeId: vehicle.routeId,
    region: route?.destinationRegion ?? vehicle.homeRegion,
  })

  raiseAlert(world, emit, {
    kind: "VEHICLE_OFFLINE",
    severity: "CRITICAL",
    title: `Vehicle ${vehicle.callSign} offline`,
    message: reason,
    vehicleId,
    deliveryId: vehicle.deliveryId,
    incidentId: incident.id,
    region: route?.destinationRegion ?? vehicle.homeRegion,
  })

  if (!vehicle.deliveryId) {
    return
  }

  const delivery = world.deliveries.get(vehicle.deliveryId)
  if (!delivery) {
    return
  }

  const entry = timelineEntry({
    kind: "incident",
    label: "Vehicle lost connectivity",
    at: now,
    detail: reason,
  })
  world.deliveries.set(delivery.id, {
    ...delivery,
    timeline: appendTimeline(delivery.timeline, entry),
  })
  emit("delivery.timeline.appended", { deliveryId: delivery.id, entry })
}

/** Brings a vehicle back and resolves the incident that took it off. */
export function bringVehicleOnline(
  world: World,
  emit: Emit,
  vehicleId: string
): void {
  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)
  if (!vehicle || !kin || vehicle.status !== "OFFLINE") {
    return
  }

  const now = world.clock.now()
  const delivery = vehicle.deliveryId
    ? world.deliveries.get(vehicle.deliveryId)
    : undefined
  const restored = deriveVehicleStatus({
    current: "IDLE",
    deliveryStatus: delivery?.status ?? null,
  })

  world.vehicles.set(vehicleId, { ...vehicle, status: restored, lastSeen: now })
  kin.offlineUntil = null

  emit("vehicle.online", {
    vehicleId,
    reason: `Telemetry restored after ${minutesSince(vehicle.lastSeen, now)} minutes`,
  })
  emit("vehicle.status.changed", {
    vehicleId,
    from: "OFFLINE",
    to: restored,
    reason: "Telemetry restored",
  })

  for (const incident of world.incidents.values()) {
    if (
      incident.vehicleId === vehicleId &&
      incident.status !== "RESOLVED" &&
      incident.type === "MECHANICAL"
    ) {
      transitionIncident(world, emit, {
        incidentId: incident.id,
        to: "RESOLVED",
        note: "Vehicle reconnected and resumed its route",
        actor: "FleetOps monitor",
      })
    }
  }

  for (const alert of [...world.alerts.values()]) {
    if (
      alert.kind === "VEHICLE_OFFLINE" &&
      alert.vehicleId === vehicleId &&
      alert.status !== "RESOLVED" &&
      alert.status !== "DISMISSED"
    ) {
      world.alerts.set(alert.id, {
        ...alert,
        status: "RESOLVED",
        updatedAt: now,
      })
      emit("alert.resolved", { alertId: alert.id })
    }
  }
}

/** Halts a moving vehicle for a while. The stop is what creates real delay. */
export function stopVehicle(
  world: World,
  emit: Emit,
  vehicleId: string,
  reason: string,
  minutes: number
): void {
  const vehicle = world.vehicles.get(vehicleId)
  const kin = world.kinematics.get(vehicleId)
  if (!vehicle || !kin || kin.routeId === null || vehicle.status === "OFFLINE") {
    return
  }

  const now = world.clock.now()
  kin.stoppedUntil = now + minutes * MINUTE_MS
  kin.speed = 0
  world.vehicles.set(vehicleId, { ...vehicle, speed: 0 })

  emit("vehicle.stopped", { vehicleId, reason })
  emit("vehicle.speed.changed", {
    vehicleId,
    from: vehicle.speed,
    to: 0,
    cause: reason,
  })

  if (!vehicle.deliveryId) {
    return
  }
  const delivery = world.deliveries.get(vehicle.deliveryId)
  if (!delivery) {
    return
  }

  const entry = timelineEntry({
    kind: "delay",
    label: "Vehicle stopped en route",
    at: now,
    detail: reason,
  })
  world.deliveries.set(delivery.id, {
    ...delivery,
    timeline: appendTimeline(delivery.timeline, entry),
  })
  emit("delivery.timeline.appended", { deliveryId: delivery.id, entry })
}

export function resumeVehicle(
  world: World,
  emit: Emit,
  vehicleId: string
): void {
  const kin = world.kinematics.get(vehicleId)
  if (!kin || kin.stoppedUntil === null) {
    return
  }
  kin.stoppedUntil = null
  emit("vehicle.online", { vehicleId, reason: "Vehicle resumed its route" })
}

/** Burns fuel and raises a one-off alert when the tank gets low. */
export function consumeFuel(
  world: World,
  emit: Emit,
  vehicleId: string,
  percent: number
): void {
  const vehicle = world.vehicles.get(vehicleId)
  if (!vehicle) {
    return
  }

  const limit = alertThresholds().lowFuelPercent
  const fuelLevel = Math.max(0, vehicle.fuelLevel - percent)
  // Only the crossing raises an alert. Without this edge check a vehicle
  // running on fumes would re-alert on every tick for the rest of its route.
  const crossedThreshold = vehicle.fuelLevel > limit && fuelLevel <= limit

  world.vehicles.set(vehicleId, { ...vehicle, fuelLevel })

  if (!crossedThreshold) {
    return
  }

  emit("vehicle.fuel.low", { vehicleId, fuelLevel })
  raiseAlert(world, emit, {
    kind: "FUEL_LOW",
    severity: "INFO",
    title: `Vehicle ${vehicle.callSign} low on fuel`,
    message: `Tank at ${Math.round(fuelLevel)}% — schedule a refuelling stop`,
    vehicleId,
    deliveryId: vehicle.deliveryId,
    region: vehicle.homeRegion,
  })
}
