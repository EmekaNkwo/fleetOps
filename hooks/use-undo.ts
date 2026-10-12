"use client"

import { useCallback } from "react"
import { useActionJournal } from "@/stores/action-journal"
import { notify } from "@/stores/toast-store"

export interface UseUndoResult {
  readonly canUndo: boolean
  /** Label of the action Ctrl+Z would reverse, for menus and tooltips. */
  readonly nextLabel: string | null
  undo(): void
}

/**
 * Undo for operator actions.
 *
 * Scoped to things the operator did, not to the simulation. The world keeps
 * moving while a decision sits on the stack, so a reversal can legitimately be
 * refused — the vehicle that was released may already be carrying something
 * else. When that happens the operator is told why, because an Undo that
 * appears to work and silently does nothing is worse than one that declines.
 */
export function useUndo(): UseUndoResult {
  const entries = useActionJournal((state) => state.entries)
  const undoLast = useActionJournal((state) => state.undoLast)

  const undo = useCallback((): void => {
    const result = undoLast()

    if (!result) {
      notify({ tone: "info", message: "Nothing to undo" })
      return
    }

    notify(
      result.applied
        ? { tone: "success", message: `Undone: ${result.entry.label.toLowerCase()}` }
        : {
            tone: "error",
            message: `Could not undo: ${result.entry.label.toLowerCase()}`,
            detail: result.entry.refusalHint,
          }
    )
  }, [undoLast])

  return {
    canUndo: entries.length > 0,
    nextLabel: entries[0]?.label ?? null,
    undo,
  }
}
