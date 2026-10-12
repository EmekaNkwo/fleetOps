import { create } from "zustand"
import {
  computePerformance,
  countDeliveries,
  startOfDay,
  type DeliveryPerformance,
} from "@/lib/calculations"
import type { Delivery, DeliveryCounts } from "@/types"

export interface DeliveryPatch {
  readonly id: string
  readonly changes: Partial<Omit<Delivery, "id">>
}

interface DeliveryState {
  readonly byId: Readonly<Record<string, Delivery>>
  readonly ids: readonly string[]
  readonly counts: DeliveryCounts
  readonly performance: DeliveryPerformance
  readonly version: number
  replaceAll(deliveries: readonly Delivery[], now: number): void
  insert(delivery: Delivery, now: number): void
  applyPatches(patches: readonly DeliveryPatch[], now: number): void
}

const EMPTY_COUNTS: DeliveryCounts = {
  total: 0,
  pending: 0,
  assigned: 0,
  inTransit: 0,
  delayed: 0,
  atRisk: 0,
  completedToday: 0,
  cancelled: 0,
}

const EMPTY_PERFORMANCE: DeliveryPerformance = {
  onTimeRate: 1,
  averageDelayMinutes: 0,
  averageDeliveryMinutes: 0,
  etaAccuracy: 1,
  deliveriesPerHour: 0,
}

/**
 * Aggregates are recomputed once per commit rather than inside selectors.
 * Eight KPI cards reading the board independently would otherwise each walk
 * 680 records on every batch; this way the walk happens once.
 */
function summarise(
  byId: Readonly<Record<string, Delivery>>,
  ids: readonly string[],
  now: number
): Pick<DeliveryState, "counts" | "performance"> {
  const deliveries = ids
    .map((id) => byId[id])
    .filter((delivery): delivery is Delivery => delivery !== undefined)

  return {
    counts: countDeliveries(deliveries, startOfDay(now)),
    performance: computePerformance(deliveries, now),
  }
}

export const useDeliveryStore = create<DeliveryState>()((set) => ({
  byId: {},
  ids: [],
  counts: EMPTY_COUNTS,
  performance: EMPTY_PERFORMANCE,
  version: 0,

  replaceAll: (deliveries, now) => {
    const byId: Record<string, Delivery> = {}
    for (const delivery of deliveries) {
      byId[delivery.id] = delivery
    }
    const ids = deliveries.map((delivery) => delivery.id)

    set((state) => ({
      byId,
      ids,
      ...summarise(byId, ids, now),
      version: state.version + 1,
    }))
  },

  insert: (delivery, now) => {
    set((state) => {
      if (state.byId[delivery.id]) {
        return state
      }
      const byId = { ...state.byId, [delivery.id]: delivery }
      const ids = [delivery.id, ...state.ids]
      return {
        byId,
        ids,
        ...summarise(byId, ids, now),
        version: state.version + 1,
      }
    })
  },

  applyPatches: (patches, now) => {
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

      return {
        byId,
        ...summarise(byId, state.ids, now),
        version: state.version + 1,
      }
    })
  },
}))
