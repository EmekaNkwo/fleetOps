import { HOUR_MS } from "@/lib/clock"
import { deriveVehicleStatus, fuelBurnPercent } from "@/lib/calculations"
import { approachHeading } from "@/lib/geo"
import { resolveProgress } from "@/lib/routing"
import type { Emit } from "./emit"
import {
  applyProgress,
  bringVehicleOnline,
  completeDelivery,
  consumeFuel,
  resumeVehicle,
  speedForRoute,
} from "./operations"
import type { TelemetryBuffer } from "./telemetry"
import { requireRoute, type World } from "./world"

export interface MovementOptions {
  /** Real milliseconds elapsed since the previous integration step. */
  readonly realDeltaMs: number
  /** When false, arriving vehicles hold at the destination instead of closing. */
  readonly closeOnArrival: boolean
  readonly telemetry: TelemetryBuffer
}

export interface MovementResult {
  readonly moved: number
  readonly arrived: number
  readonly recovered: number
}

/** Speed change worth announcing, in km/h. */
const SPEED_EVENT_THRESHOLD = 12

/**
 * Advances every vehicle one integration step.
 *
 * Distance along the route is the integrated quantity, so positions always
 * follow the corridor geometry. Everything a human reads — coordinates,
 * heading, ETA, delivery status — is derived from it rather than stored
 * independently, which is why the map, the panels and the metrics cannot drift
 * out of agreement.
 */
export function integrateMovement(
  world: World,
  emit: Emit,
  options: MovementOptions
): MovementResult {
  const { realDeltaMs, closeOnArrival, telemetry } = options
  const simulatedMs = world.clock.advance(realDeltaMs)
  const now = simulatedMs
  const stepHours = (realDeltaMs * world.clock.scale) / HOUR_MS

  let moved = 0
  let arrived = 0
  let recovered = 0

  for (const kin of world.kinematics.values()) {
    const vehicle = world.vehicles.get(kin.vehicleId)
    if (!vehicle) {
      continue
    }

    // Reconnect vehicles whose outage has elapsed.
    if (vehicle.status === "OFFLINE") {
      if (kin.offlineUntil !== null && now >= kin.offlineUntil) {
        bringVehicleOnline(world, emit, kin.vehicleId)
        recovered += 1
      } else {
        telemetry.patchStatus(kin.vehicleId, "OFFLINE")
        continue
      }
    }

    if (kin.routeId === null) {
      continue
    }

    // Release vehicles whose hold has expired.
    if (kin.stoppedUntil !== null) {
      if (now >= kin.stoppedUntil) {
        resumeVehicle(world, emit, kin.vehicleId)
        recovered += 1
      } else {
        writeTelemetry(world, telemetry, kin.vehicleId, 0)
        continue
      }
    }

    const route = requireRoute(world, kin.routeId)
    const speed = speedForRoute(world, route, kin.jitter)
    const previousSpeed = kin.speed
    const advanceKm = speed * stepHours

    kin.travelledKm = Math.min(
      route.totalDistanceKm,
      kin.travelledKm + advanceKm
    )
    kin.speed = speed

    const progress = resolveProgress(route, kin.travelledKm)
    kin.heading = approachHeading(kin.heading, progress.bearing, 0.4)

    const deliveryStatusBefore = vehicle.deliveryId
      ? world.deliveries.get(vehicle.deliveryId)?.status ?? null
      : null

    const hasArrived = kin.travelledKm >= route.totalDistanceKm - 0.001

    if (vehicle.deliveryId && hasArrived && closeOnArrival) {
      completeDelivery(world, emit, vehicle.deliveryId)
      telemetry.write({
        vehicleId: kin.vehicleId,
        callSign: vehicle.callSign,
        status: "DELIVERED",
        location: progress.position,
        heading: kin.heading,
        speed: 0,
        routeId: null,
        deliveryId: null,
      })
      arrived += 1
      continue
    }

    const updatedDelivery = vehicle.deliveryId
      ? applyProgress(world, emit, {
          deliveryId: vehicle.deliveryId,
          travelledKm: kin.travelledKm,
          speed,
          cause: trafficCause(world, route.id),
        })
      : null

    const nextStatus = deriveVehicleStatus({
      current: vehicle.status,
      deliveryStatus: updatedDelivery?.status ?? deliveryStatusBefore,
    })

    world.vehicles.set(kin.vehicleId, {
      ...vehicle,
      status: nextStatus,
      location: progress.position,
      heading: kin.heading,
      speed,
      lastSeen: now,
    })

    if (nextStatus !== vehicle.status) {
      emit("vehicle.status.changed", {
        vehicleId: kin.vehicleId,
        from: vehicle.status,
        to: nextStatus,
        reason: updatedDelivery
          ? `Delivery #${updatedDelivery.reference} is ${updatedDelivery.status.toLowerCase().replace("_", " ")}`
          : "Status re-evaluated",
      })
    }

    if (Math.abs(previousSpeed - speed) >= SPEED_EVENT_THRESHOLD) {
      emit("vehicle.speed.changed", {
        vehicleId: kin.vehicleId,
        from: Math.round(previousSpeed),
        to: Math.round(speed),
        cause: trafficCause(world, route.id),
      })
    }

    emit("vehicle.location.updated", {
      vehicleId: kin.vehicleId,
      location: progress.position,
      heading: kin.heading,
      speed,
      routeId: route.id,
      travelledKm: kin.travelledKm,
    })

    telemetry.write({
      vehicleId: kin.vehicleId,
      callSign: vehicle.callSign,
      status: nextStatus,
      location: progress.position,
      heading: kin.heading,
      speed,
      routeId: route.id,
      deliveryId: vehicle.deliveryId,
    })

    consumeFuel(
      world,
      emit,
      kin.vehicleId,
      fuelBurnPercent(advanceKm, vehicle.capacityKg)
    )

    moved += 1
  }

  return { moved, arrived, recovered }
}

function trafficCause(world: World, routeId: string): string {
  const condition = world.traffic.get(routeId)
  if (!condition || condition.level === "normal") {
    return "Steady progress on route"
  }
  return condition.description
}

function writeTelemetry(
  world: World,
  telemetry: TelemetryBuffer,
  vehicleId: string,
  speed: number
): void {
  const vehicle = world.vehicles.get(vehicleId)
  if (!vehicle) {
    return
  }
  telemetry.write({
    vehicleId,
    callSign: vehicle.callSign,
    status: vehicle.status,
    location: vehicle.location,
    heading: vehicle.heading,
    speed,
    routeId: vehicle.routeId,
    deliveryId: vehicle.deliveryId,
  })
}

/** Seeds the telemetry buffer so the map can draw before the first tick. */
export function seedTelemetry(
  world: World,
  telemetry: TelemetryBuffer
): void {
  telemetry.clear()
  for (const vehicle of world.vehicles.values()) {
    telemetry.write({
      vehicleId: vehicle.id,
      callSign: vehicle.callSign,
      status: vehicle.status,
      location: vehicle.location,
      heading: vehicle.heading,
      speed: vehicle.speed,
      routeId: vehicle.routeId,
      deliveryId: vehicle.deliveryId,
    })
  }
}
