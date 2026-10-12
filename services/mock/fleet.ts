import { VEHICLE_TYPES } from "@/data/config"
import { PLATE_PREFIXES } from "@/data/people"
import { HOUR_MS } from "@/lib/clock"
import type { Rng } from "@/lib/random"
import { resolveProgress } from "@/lib/routing"
import type { Route, Vehicle } from "@/types"
import type { VehicleKinematics } from "@/services/simulation/world"
import { callSign, vehicleId } from "./ids"

export interface GeneratedVehicle {
  readonly vehicle: Vehicle
  readonly kinematics: VehicleKinematics
}

function plateNumber(rng: Rng): string {
  const prefix = rng.pick(PLATE_PREFIXES)
  const digits = String(rng.int(100, 999))
  const letters = Array.from({ length: 2 }, () =>
    String.fromCharCode(rng.int(65, 90))
  ).join("")
  return `${prefix}-${digits}-${letters}`
}

/**
 * Builds the fleet as parked vehicles at a plausible home depot. Route and
 * delivery assignment happens afterwards, in the delivery generator, so the two
 * stay consistent.
 */
export function generateFleet(
  rng: Rng,
  count: number,
  routes: readonly Route[],
  driverIds: readonly string[],
  now: number
): GeneratedVehicle[] {
  const fleet: GeneratedVehicle[] = []

  for (let index = 0; index < count; index += 1) {
    const spec = VEHICLE_TYPES[rng.int(0, VEHICLE_TYPES.length - 1)]
    if (!spec) {
      continue
    }
    const homeRoute = rng.pick(routes)
    const driver = driverIds[index % driverIds.length] ?? driverIds[0] ?? "driver-0"
    const progress = resolveProgress(homeRoute, 0)

    fleet.push({
      vehicle: {
        id: vehicleId(index),
        callSign: callSign(index),
        type: spec.type,
        plateNumber: plateNumber(rng),
        driverId: driver,
        status: "IDLE",
        location: progress.position,
        speed: 0,
        heading: progress.bearing,
        routeId: null,
        deliveryId: null,
        homeRegion: homeRoute.originRegion,
        fuelLevel: rng.int(22, 100),
        mileageKm: rng.int(18_000, 480_000),
        lastMaintenance: now - rng.int(2, 150) * 24 * HOUR_MS,
        capacityKg: spec.capacityKg,
        lastSeen: now,
      },
      kinematics: {
        vehicleId: vehicleId(index),
        routeId: null,
        travelledKm: 0,
        speed: 0,
        heading: progress.bearing,
        jitter: Number(rng.float(-0.12, 0.12).toFixed(3)),
        offlineUntil: null,
        stoppedUntil: null,
      },
    })
  }

  return fleet
}
