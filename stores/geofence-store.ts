import { create } from "zustand"
import { simulationEngine } from "@/services/simulation"
import {
  geofenceStorage,
  MAX_GEOFENCES,
  MAX_ZONE_NAME_LENGTH,
  DWELL_LIMITS,
  RADIUS_LIMITS,
} from "@/services/storage/geofences"
import type { Geofence, GeofenceTrigger, Location } from "@/types"

export interface GeofenceDraft {
  readonly name: string
  readonly centre: Location
  readonly radiusKm: number
  readonly triggers: readonly GeofenceTrigger[]
  readonly dwellMinutes: number
}

interface GeofenceState {
  readonly zones: readonly Geofence[]
  /** True while the operator is picking a centre on the map. */
  readonly placing: boolean
  readonly atLimit: boolean
  hydrate(): void
  setPlacing(placing: boolean): void
  add(draft: GeofenceDraft): string | null
  update(id: string, changes: Partial<GeofenceDraft>): void
  toggle(id: string): void
  remove(id: string): Geofence | null
  /** Puts a removed zone back, for undo. */
  restore(zone: Geofence): boolean
}

let counter = 0

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Pushes the current zone set into the engine.
 *
 * The engine evaluates zones inside the movement tick, where there is no React
 * and no store subscription. Every mutation here therefore ends with an
 * explicit handoff — one place, so the two cannot drift.
 */
function publish(zones: readonly Geofence[]): readonly Geofence[] {
  geofenceStorage.save(zones)
  simulationEngine.setGeofences(zones)
  return zones
}

/**
 * Geofence zones.
 *
 * A store rather than local component state because three surfaces need them
 * at once: the panel that edits them, the map that draws them, and the engine
 * that evaluates them. The engine is not a subscriber — it is pushed to — which
 * keeps the simulation free of any dependency on React.
 */
export const useGeofenceStore = create<GeofenceState>()((set, get) => ({
  zones: [],
  placing: false,
  atLimit: false,

  hydrate: () => {
    const zones = geofenceStorage.load()
    simulationEngine.setGeofences(zones)
    set({ zones, atLimit: zones.length >= MAX_GEOFENCES })
  },

  setPlacing: (placing) => {
    set({ placing })
  },

  add: (draft) => {
    const current = get().zones
    if (current.length >= MAX_GEOFENCES) {
      return null
    }

    counter += 1
    const zone: Geofence = {
      id: `zone-${Date.now()}-${counter}`,
      name: draft.name.trim().slice(0, MAX_ZONE_NAME_LENGTH) || "Unnamed zone",
      centre: draft.centre,
      radiusKm: clamp(draft.radiusKm, RADIUS_LIMITS.min, RADIUS_LIMITS.max),
      triggers: draft.triggers.length > 0 ? draft.triggers : ["enter"],
      dwellMinutes: clamp(draft.dwellMinutes, DWELL_LIMITS.min, DWELL_LIMITS.max),
      enabled: true,
      createdAt: Date.now(),
    }

    const zones = publish([...current, zone])
    set({ zones, placing: false, atLimit: zones.length >= MAX_GEOFENCES })
    return zone.id
  },

  update: (id, changes) => {
    const zones = publish(
      get().zones.map((zone) =>
        zone.id === id
          ? {
              ...zone,
              ...(changes.name === undefined
                ? {}
                : { name: changes.name.slice(0, MAX_ZONE_NAME_LENGTH) }),
              ...(changes.radiusKm === undefined
                ? {}
                : {
                    radiusKm: clamp(
                      changes.radiusKm,
                      RADIUS_LIMITS.min,
                      RADIUS_LIMITS.max
                    ),
                  }),
              ...(changes.dwellMinutes === undefined
                ? {}
                : {
                    dwellMinutes: clamp(
                      changes.dwellMinutes,
                      DWELL_LIMITS.min,
                      DWELL_LIMITS.max
                    ),
                  }),
              ...(changes.triggers === undefined
                ? {}
                : {
                    triggers:
                      changes.triggers.length > 0 ? changes.triggers : ["enter"],
                  }),
              ...(changes.centre === undefined ? {} : { centre: changes.centre }),
            }
          : zone
      )
    )
    set({ zones })
  },

  toggle: (id) => {
    const zones = publish(
      get().zones.map((zone) =>
        zone.id === id ? { ...zone, enabled: !zone.enabled } : zone
      )
    )
    set({ zones })
  },

  remove: (id) => {
    const removed = get().zones.find((zone) => zone.id === id) ?? null
    const zones = publish(get().zones.filter((zone) => zone.id !== id))
    set({ zones, atLimit: zones.length >= MAX_GEOFENCES })
    return removed
  },

  restore: (zone) => {
    const current = get().zones
    if (current.length >= MAX_GEOFENCES) {
      return false
    }
    const zones = publish([...current, zone])
    set({ zones, atLimit: zones.length >= MAX_GEOFENCES })
    return true
  },
}))
