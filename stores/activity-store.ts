import { create } from "zustand"
import { ACTIVITY_LIMIT } from "@/data/config"
import type { ActivityEvent } from "@/types"

interface ActivityState {
  /** Newest first. Capped, so a long session cannot grow without bound. */
  readonly events: readonly ActivityEvent[]
  readonly total: number
  replaceAll(events: readonly ActivityEvent[]): void
  append(events: readonly ActivityEvent[]): void
  clear(): void
}

export const useActivityStore = create<ActivityState>()((set) => ({
  events: [],
  total: 0,

  replaceAll: (events) => {
    set({ events: events.slice(0, ACTIVITY_LIMIT), total: events.length })
  },

  append: (incoming) => {
    if (incoming.length === 0) {
      return
    }
    set((state) => ({
      // Incoming batches arrive oldest-first from the batcher; reversing keeps
      // the feed strictly newest-first without re-sorting the whole list.
      events: [...[...incoming].reverse(), ...state.events].slice(
        0,
        ACTIVITY_LIMIT
      ),
      total: state.total + incoming.length,
    }))
  },

  clear: () => {
    set({ events: [], total: 0 })
  },
}))
