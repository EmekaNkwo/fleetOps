import { create } from "zustand"

interface ReplayState {
  /** Index into the recorder's frames while reviewing, otherwise null. */
  readonly index: number | null
  /** Whether the simulation was running when review began. */
  readonly wasRunning: boolean
  /** Bumped when review starts, so the frame list is re-read. */
  readonly version: number
  readonly reviewing: boolean
  begin(index: number, wasRunning: boolean): void
  setIndex(index: number): void
  end(): void
}

/**
 * Review-mode state.
 *
 * In a store rather than component state because the whole console has to know
 * about it: the control bar drives it, and every surface that issues a command
 * has to refuse while it is on. A hook-local `useState` would leave the rest of
 * the app believing it was looking at live data.
 */
export const useReplayStore = create<ReplayState>()((set) => ({
  index: null,
  wasRunning: false,
  version: 0,
  reviewing: false,

  begin: (index, wasRunning) => {
    set((state) => ({
      index,
      wasRunning,
      reviewing: true,
      version: state.version + 1,
    }))
  },
  setIndex: (index) => {
    set({ index })
  },
  end: () => {
    set({ index: null, reviewing: false, wasRunning: false })
  },
}))

/** Imperative read for non-React callers, e.g. command guards. */
export function isReviewing(): boolean {
  return useReplayStore.getState().reviewing
}
