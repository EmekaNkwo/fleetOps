"use client"

import { useCallback } from "react"
import {
  DWELL_LIMITS,
  MAX_GEOFENCES,
  MAX_ZONE_NAME_LENGTH,
  RADIUS_LIMITS,
} from "@/services/storage/geofences"
import { useActionJournal } from "@/stores/action-journal"
import {
  useGeofenceStore,
  type GeofenceDraft,
} from "@/stores/geofence-store"
import { notify } from "@/stores/toast-store"
import type { Geofence, GeofenceTrigger, Location } from "@/types"

export interface UseGeofencesResult {
  readonly zones: readonly Geofence[]
  readonly placing: boolean
  readonly atLimit: boolean
  readonly limits: {
    readonly maxZones: number
    readonly maxNameLength: number
    readonly radius: typeof RADIUS_LIMITS
    readonly dwell: typeof DWELL_LIMITS
  }
  beginPlacing(): void
  cancelPlacing(): void
  /** Called by the map when the operator clicks a centre while placing. */
  placeAt(centre: Location): void
  create(draft: GeofenceDraft): void
  update(id: string, changes: Partial<GeofenceDraft>): void
  toggle(id: string): void
  remove(id: string): void
}

/** Defaults for a zone dropped on the map, before the operator edits it. */
const DEFAULT_RADIUS_KM = 15
const DEFAULT_DWELL_MINUTES = 30
const DEFAULT_TRIGGERS: readonly GeofenceTrigger[] = ["enter", "exit"]

/**
 * Zone management.
 *
 * Placement is a two-step gesture — arm, then click the map — rather than a
 * coordinate form, because a boundary is a spatial decision and typing
 * latitudes to define one is the wrong instrument. The panel edits the numbers
 * afterwards, where precision does matter.
 */
export function useGeofences(): UseGeofencesResult {
  const zones = useGeofenceStore((state) => state.zones)
  const placing = useGeofenceStore((state) => state.placing)
  const atLimit = useGeofenceStore((state) => state.atLimit)
  const setPlacing = useGeofenceStore((state) => state.setPlacing)
  const add = useGeofenceStore((state) => state.add)
  const updateZone = useGeofenceStore((state) => state.update)
  const toggleZone = useGeofenceStore((state) => state.toggle)
  const removeZone = useGeofenceStore((state) => state.remove)
  const restoreZone = useGeofenceStore((state) => state.restore)
  const record = useActionJournal((state) => state.record)

  const create = useCallback(
    (draft: GeofenceDraft): void => {
      const created = add(draft)
      if (!created) {
        notify({
          tone: "warning",
          message: "Zone limit reached",
          detail: `The console tracks at most ${MAX_GEOFENCES} zones. Delete one to add another.`,
        })
        return
      }
      notify({ tone: "success", message: `Zone “${draft.name}” created` })
    },
    [add]
  )

  const placeAt = useCallback(
    (centre: Location): void => {
      create({
        name: `Zone ${useGeofenceStore.getState().zones.length + 1}`,
        centre,
        radiusKm: DEFAULT_RADIUS_KM,
        triggers: DEFAULT_TRIGGERS,
        dwellMinutes: DEFAULT_DWELL_MINUTES,
      })
    },
    [create]
  )

  const remove = useCallback(
    (id: string): void => {
      const removed = removeZone(id)
      if (!removed) {
        return
      }

      const entryId = record({
        label: `Deleted zone “${removed.name}”`,
        refusalHint: "There is no room left for another zone.",
        undo: () => restoreZone(removed),
      })

      notify({
        tone: "warning",
        message: `Zone “${removed.name}” deleted`,
        action: {
          label: "Undo",
          run: () => {
            const applied = useActionJournal.getState().undoEntry(entryId)
            if (applied) {
              notify({ tone: "success", message: `Zone “${removed.name}” restored` })
            }
          },
        },
      })
    },
    [removeZone, restoreZone, record]
  )

  return {
    zones,
    placing,
    atLimit,
    limits: {
      maxZones: MAX_GEOFENCES,
      maxNameLength: MAX_ZONE_NAME_LENGTH,
      radius: RADIUS_LIMITS,
      dwell: DWELL_LIMITS,
    },
    beginPlacing: () => setPlacing(true),
    cancelPlacing: () => setPlacing(false),
    placeAt,
    create,
    update: updateZone,
    toggle: toggleZone,
    remove,
  }
}
