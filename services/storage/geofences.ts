/**
 * Operator-defined zones.
 *
 * Configuration rather than operational state, so it lives in storage and
 * survives both a reload and a simulation reset — a depot boundary does not
 * stop existing because the shift restarted.
 */
import { NIGERIA_BOUNDS } from "@/data/geography"
import type { Geofence, GeofenceTrigger } from "@/types"
import { readValue, writeValue } from "./local-storage"

const KEY = "geofences"

/** Bounded so the movement tick's work stays predictable: zones × vehicles. */
export const MAX_GEOFENCES = 12

export const MAX_ZONE_NAME_LENGTH = 32
export const RADIUS_LIMITS = { min: 1, max: 250 } as const
export const DWELL_LIMITS = { min: 1, max: 240 } as const

const TRIGGERS = new Set<string>(["enter", "exit", "dwell"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Validates one stored zone.
 *
 * A zone whose centre falls outside the operating area is dropped rather than
 * clamped onto the edge of it: silently relocating someone's boundary would
 * raise breaches for crossings that never happened.
 */
function parseZone(raw: unknown): Geofence | null {
  if (!isRecord(raw)) {
    return null
  }

  const { id, name, centre, radiusKm, triggers, dwellMinutes, enabled, createdAt } =
    raw

  if (typeof id !== "string" || typeof name !== "string" || name.length === 0) {
    return null
  }
  if (!isRecord(centre)) {
    return null
  }

  const lat = centre.lat
  const lng = centre.lng
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null
  }
  if (
    lat < NIGERIA_BOUNDS.south ||
    lat > NIGERIA_BOUNDS.north ||
    lng < NIGERIA_BOUNDS.west ||
    lng > NIGERIA_BOUNDS.east
  ) {
    return null
  }

  const parsedTriggers = Array.isArray(triggers)
    ? triggers.filter(
        (trigger): trigger is GeofenceTrigger =>
          typeof trigger === "string" && TRIGGERS.has(trigger)
      )
    : []

  return {
    id,
    name: name.slice(0, MAX_ZONE_NAME_LENGTH),
    centre: { lat, lng },
    radiusKm:
      typeof radiusKm === "number" && Number.isFinite(radiusKm)
        ? clamp(radiusKm, RADIUS_LIMITS.min, RADIUS_LIMITS.max)
        : 10,
    // A zone with no trigger can never fire, which is almost certainly a
    // corrupted record rather than an intention.
    triggers: parsedTriggers.length > 0 ? parsedTriggers : ["enter"],
    dwellMinutes:
      typeof dwellMinutes === "number" && Number.isFinite(dwellMinutes)
        ? clamp(dwellMinutes, DWELL_LIMITS.min, DWELL_LIMITS.max)
        : 30,
    enabled: typeof enabled === "boolean" ? enabled : true,
    createdAt: typeof createdAt === "number" ? createdAt : 0,
  }
}

export const geofenceStorage = {
  load: (): readonly Geofence[] =>
    readValue(
      KEY,
      (raw) =>
        Array.isArray(raw)
          ? raw
              .map(parseZone)
              .filter((zone): zone is Geofence => zone !== null)
              .slice(0, MAX_GEOFENCES)
          : null,
      []
    ),

  save: (zones: readonly Geofence[]): void => {
    writeValue(KEY, zones.slice(0, MAX_GEOFENCES))
  },
}
