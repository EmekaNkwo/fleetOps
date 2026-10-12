import { create } from "zustand"
import { countFleet } from "@/lib/calculations"
import type { FleetCounts, Vehicle } from "@/types"

/** A partial vehicle update produced by one domain event. */
export interface VehiclePatch {
  readonly id: string
  readonly changes: Partial<Omit<Vehicle, "id">>
}

interface VehicleState {
  readonly byId: Readonly<Record<string, Vehicle>>
  readonly ids: readonly string[]
  readonly counts: FleetCounts
  /** Bumped on every commit; cheap dependency for memoised derivations. */
  readonly version: number
  replaceAll(vehicles: readonly Vehicle[]): void
  /**
   * Applies many patches in one commit. The simulation produces hundreds of
   * position updates per second, and committing them individually would mean
   * hundreds of React reconciliations — this is the batch boundary.
   */
  applyPatches(patches: readonly VehiclePatch[]): void
}

const EMPTY_COUNTS: FleetCounts = {
  total: 0,
  online: 0,
  offline: 0,
  onRoute: 0,
  idle: 0,
  delayed: 0,
  atRisk: 0,
}

export const useVehicleStore = create<VehicleState>()((set) => ({
  byId: {},
  ids: [],
  counts: EMPTY_COUNTS,
  version: 0,

  replaceAll: (vehicles) => {
    const byId: Record<string, Vehicle> = {}
    for (const vehicle of vehicles) {
      byId[vehicle.id] = vehicle
    }
    set((state) => ({
      byId,
      ids: vehicles.map((vehicle) => vehicle.id),
      counts: countFleet(vehicles),
      version: state.version + 1,
    }))
  },

  applyPatches: (patches) => {
    if (patches.length === 0) {
      return
    }

    set((state) => {
      const byId = { ...state.byId }
      let touched = false

      for (const patch of patches) {
        const current = byId[patch.id]
        if (!current) {
          continue
        }
        byId[patch.id] = { ...current, ...patch.changes }
        touched = true
      }

      if (!touched) {
        return state
      }

      const vehicles = state.ids
        .map((id) => byId[id])
        .filter((vehicle): vehicle is Vehicle => vehicle !== undefined)

      return {
        byId,
        counts: countFleet(vehicles),
        version: state.version + 1,
      }
    })
  },
}))
