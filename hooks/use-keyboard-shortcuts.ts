"use client"

import { useEffect, useMemo } from "react"
import { useUiStore } from "@/stores"
import { useCommands } from "./use-commands"
import { useUndo } from "./use-undo"

export interface ShortcutDescription {
  readonly keys: string
  readonly label: string
  readonly group: string
}

/** The reference list rendered by the shortcuts panel. */
export const SHORTCUTS: readonly ShortcutDescription[] = [
  { keys: "Ctrl / ⌘ + K", label: "Open command palette", group: "General" },
  { keys: "Ctrl / ⌘ + Z", label: "Undo the last dispatch action", group: "General" },
  { keys: "/", label: "Global search", group: "General" },
  { keys: "Esc", label: "Close the topmost panel or dialog", group: "General" },
  { keys: "?", label: "Show this list", group: "General" },
  { keys: "S", label: "Start or pause the simulation", group: "Simulation" },
  { keys: "R", label: "Reset the simulation", group: "Simulation" },
  { keys: "A", label: "Open alerts", group: "Panels" },
  { keys: "I", label: "Open incidents", group: "Panels" },
  { keys: "F", label: "Open the refuelling worklist", group: "Panels" },
  { keys: "Z", label: "Open geofence zones", group: "Panels" },
  { keys: "M", label: "Focus the live map", group: "Workspace" },
  { keys: "D", label: "Open the delivery board", group: "Workspace" },
  { keys: "W", label: "Open the driver roster", group: "Workspace" },
  { keys: "C", label: "Open route corridors", group: "Workspace" },
  { keys: "G", label: "Open analytics", group: "Workspace" },
  { keys: "P", label: "Review recent snapshots", group: "View" },
  { keys: "H", label: "Open the shift handover report", group: "View" },
  { keys: "T", label: "Toggle dark mode", group: "View" },
]

/** Input types that swallow printable characters. */
const TEXT_ENTRY_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable || target.tagName === "TEXTAREA") {
    return true
  }

  if (target instanceof HTMLSelectElement) {
    return true
  }

  // Checkboxes and radios are inputs too, but they take no text. Treating them
  // as typing targets meant the keyboard stopped responding after ticking a
  // row in the delivery board.
  if (target instanceof HTMLInputElement) {
    return TEXT_ENTRY_TYPES.has(target.type)
  }

  return false
}

/**
 * Global keyboard handling.
 *
 * Single-letter shortcuts are suppressed while the user is typing, and every
 * binding resolves to a command from the shared registry rather than
 * reimplementing the action — so the palette and the keyboard always agree.
 */
export function useKeyboardShortcuts(): void {
  const commands = useCommands()
  const { undo } = useUndo()
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen
  )
  const dismissTopLayer = useUiStore((state) => state.dismissTopLayer)

  const byShortcut = useMemo(() => {
    const map = new Map<string, () => void>()
    for (const command of commands) {
      if (command.shortcut) {
        map.set(command.shortcut.toLowerCase(), command.run)
      }
    }
    return map
  }, [commands])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      const key = event.key.toLowerCase()

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Undo is allowed while typing: the operator may well be mid-search when
      // they realise the delivery they just cancelled was the wrong one.
      if ((event.metaKey || event.ctrlKey) && key === "z" && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }

      if (key === "escape") {
        if (dismissTopLayer()) {
          event.preventDefault()
        }
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      const run = byShortcut.get(key)
      if (run) {
        event.preventDefault()
        run()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [byShortcut, dismissTopLayer, setCommandPaletteOpen, undo])
}
