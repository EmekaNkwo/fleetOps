import { MINUTE_MS } from "@/lib/clock"
import { haversineKm } from "@/lib/geo"
import type { Geofence, GeofenceTrigger } from "@/types"
import type { Emit } from "../emit"
import type { World } from "../world"
import { raiseAlert } from "./records"

/**
 * Per-vehicle occupancy, keyed `zoneId|vehicleId`.
 *
 * Held outside the world because it is derived observation rather than
 * operational state: resetting the simulation should forget it, and nothing in
 * a snapshot needs it. `enteredAt` is simulated time, so a dwell measured here
 * matches the clock every other duration in the app is measured against.
 */
interface Occupancy {
  readonly enteredAt: number
  dwellFired: boolean
}

const occupancy = new Map<string, Occupancy>()

function key(zoneId: string, vehicleId: string): string {
  return `${zoneId}|${vehicleId}`
}

/** Forgets every occupancy. Called on reset and when zones change. */
export function clearGeofenceState(): void {
  occupancy.clear()
}

/** Drops the state for one zone, so re-enabling it starts clean. */
export function clearZoneState(zoneId: string): void {
  for (const entry of [...occupancy.keys()]) {
    if (entry.startsWith(`${zoneId}|`)) {
      occupancy.delete(entry)
    }
  }
}

const SEVERITY: Readonly<Record<GeofenceTrigger, "INFO" | "WARNING">> = {
  enter: "INFO",
  exit: "INFO",
  dwell: "WARNING",
}

function describe(
  trigger: GeofenceTrigger,
  zoneName: string,
  callSign: string,
  dwellMinutes: number
): { title: string; message: string } {
  switch (trigger) {
    case "enter":
      return {
        title: `Vehicle ${callSign} entered ${zoneName}`,
        message: `Arrived inside the ${zoneName} zone.`,
      }
    case "exit":
      return {
        title: `Vehicle ${callSign} left ${zoneName}`,
        message: `No longer inside the ${zoneName} zone.`,
      }
    case "dwell":
    default:
      return {
        title: `Vehicle ${callSign} held in ${zoneName}`,
        message: `Stationary inside ${zoneName} for ${Math.round(dwellMinutes)} minutes.`,
      }
  }
}

/**
 * Evaluates every vehicle against every zone and raises the crossings.
 *
 * Called once per movement tick rather than per position update: a vehicle
 * sitting on a zone boundary would otherwise flap between enter and exit many
 * times a second. Occupancy is edge-triggered — an alert is raised on the
 * transition, never for the steady state — which is the difference between a
 * geofence and a continuous notification.
 *
 * Returns how many breaches were raised, for the tick summary.
 */
export function evaluateGeofences(
  world: World,
  emit: Emit,
  zones: readonly Geofence[]
): number {
  const active = zones.filter((zone) => zone.enabled)
  if (active.length === 0) {
    if (occupancy.size > 0) {
      occupancy.clear()
    }
    return 0
  }

  const now = world.clock.now()
  let breaches = 0

  for (const zone of active) {
    for (const vehicle of world.vehicles.values()) {
      // An offline vehicle has no trustworthy position, so its occupancy is
      // left exactly as it was rather than being inferred from stale telemetry.
      if (vehicle.status === "OFFLINE") {
        continue
      }

      const distanceKm = haversineKm(vehicle.location, zone.centre)
      const inside = distanceKm <= zone.radiusKm
      const entry = occupancy.get(key(zone.id, vehicle.id))

      if (inside && !entry) {
        occupancy.set(key(zone.id, vehicle.id), {
          enteredAt: now,
          dwellFired: false,
        })

        if (zone.triggers.includes("enter")) {
          breaches += 1
          raiseGeofenceAlert(world, emit, zone, vehicle.id, vehicle.callSign, "enter", 0)
        }
        continue
      }

      if (!inside && entry) {
        occupancy.delete(key(zone.id, vehicle.id))

        if (zone.triggers.includes("exit")) {
          breaches += 1
          raiseGeofenceAlert(world, emit, zone, vehicle.id, vehicle.callSign, "exit", 0)
        }
        continue
      }

      if (inside && entry && zone.triggers.includes("dwell") && !entry.dwellFired) {
        const dwellMinutes = (now - entry.enteredAt) / MINUTE_MS
        if (dwellMinutes >= zone.dwellMinutes) {
          // Fired once per visit. Re-entering the zone creates a new occupancy
          // record and therefore earns a new dwell alert.
          entry.dwellFired = true
          breaches += 1
          raiseGeofenceAlert(
            world,
            emit,
            zone,
            vehicle.id,
            vehicle.callSign,
            "dwell",
            dwellMinutes
          )
        }
      }
    }
  }

  return breaches
}

function raiseGeofenceAlert(
  world: World,
  emit: Emit,
  zone: Geofence,
  vehicleId: string,
  callSign: string,
  trigger: GeofenceTrigger,
  dwellMinutes: number
): void {
  const copy = describe(trigger, zone.name, callSign, dwellMinutes)
  const vehicle = world.vehicles.get(vehicleId)

  emit("geofence.breached", {
    zoneId: zone.id,
    zoneName: zone.name,
    vehicleId,
    trigger,
    dwellMinutes,
  })

  raiseAlert(world, emit, {
    kind: "GEOFENCE_BREACH",
    severity: SEVERITY[trigger],
    title: copy.title,
    message: copy.message,
    vehicleId,
    deliveryId: vehicle?.deliveryId ?? null,
    region: vehicle?.homeRegion ?? null,
  })
}
