import { create } from "zustand"

export interface JournalEntry {
  readonly id: string
  /** Past tense, shown in the toast and the journal list. */
  readonly label: string
  readonly at: number
  /**
   * Reverses the action. Returns false when the world has moved on far enough
   * that the reversal no longer makes sense — the vehicle that was released has
   * since been dispatched elsewhere, say. A refused undo is reported, never
   * silently dropped.
   */
  undo(): boolean
  /** Why an undo could not be applied, for the operator. */
  readonly refusalHint: string
}

interface ActionJournalState {
  readonly entries: readonly JournalEntry[]
  record(entry: Omit<JournalEntry, "id" | "at">): string
  /** Pops the newest entry and reverses it. */
  undoLast(): { readonly entry: JournalEntry; readonly applied: boolean } | null
  /** Reverses a specific entry, e.g. from a toast that is still on screen. */
  undoEntry(id: string): boolean
  readonly canUndo: boolean
  clear(): void
}

/**
 * How far back undo reaches.
 *
 * Deliberately shallow. The simulation is always moving, so an action from
 * forty steps ago describes a world that no longer exists; offering to reverse
 * it would mostly produce refusals. Shallow and reliable beats deep and
 * unpredictable.
 */
const MAX_ENTRIES = 25

let counter = 0

/**
 * The operator action journal.
 *
 * Only actions that can be genuinely reversed are recorded. Completing a
 * delivery is not one of them: it is counted into the day's throughput the
 * moment it closes, and un-counting it would leave the metrics describing a
 * shift that never happened. Incident transitions are the same — the lifecycle
 * is forward-only by design. Those actions simply do not enter the journal,
 * which is more honest than an Undo button that quietly does nothing.
 */
export const useActionJournal = create<ActionJournalState>()((set, get) => ({
  entries: [],
  canUndo: false,

  record: (entry) => {
    counter += 1
    const id = `action-${counter}`

    set((state) => ({
      entries: [{ ...entry, id, at: Date.now() }, ...state.entries].slice(
        0,
        MAX_ENTRIES
      ),
      canUndo: true,
    }))

    return id
  },

  undoLast: () => {
    const [entry] = get().entries
    if (!entry) {
      return null
    }

    const applied = entry.undo()
    set((state) => {
      const entries = state.entries.filter((candidate) => candidate.id !== entry.id)
      return { entries, canUndo: entries.length > 0 }
    })

    return { entry, applied }
  },

  undoEntry: (id) => {
    const entry = get().entries.find((candidate) => candidate.id === id)
    if (!entry) {
      return false
    }

    const applied = entry.undo()
    set((state) => {
      const entries = state.entries.filter((candidate) => candidate.id !== id)
      return { entries, canUndo: entries.length > 0 }
    })

    return applied
  },

  clear: () => {
    set({ entries: [], canUndo: false })
  },
}))
