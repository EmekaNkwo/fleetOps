"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Command, CommandGroup } from "@/hooks"

export interface CommandPaletteProps {
  readonly open: boolean
  readonly commands: readonly Command[]
  onOpenChange(open: boolean): void
}

const GROUP_ORDER: readonly CommandGroup[] = [
  "Navigate",
  "Dispatch",
  "Simulation",
  "Scenarios",
  "View",
]

/**
 * Command palette.
 *
 * Every entry comes from the shared command registry, so the palette, the
 * keyboard shortcuts and the buttons in the chrome all invoke the same function
 * — there is no second implementation to drift.
 */
export function CommandPalette({
  open,
  commands,
  onOpenChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) {
      return commands
    }
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(needle) ||
        command.group.toLowerCase().includes(needle) ||
        (command.hint?.toLowerCase().includes(needle) ?? false)
    )
  }, [commands, query])

  const grouped = useMemo(() => {
    const groups = new Map<CommandGroup, Command[]>()
    for (const command of filtered) {
      const bucket = groups.get(command.group) ?? []
      bucket.push(command)
      groups.set(command.group, bucket)
    }
    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
      group,
      commands: groups.get(group) ?? [],
    }))
  }, [filtered])

  /** Flattened in render order, so arrow keys move across group boundaries. */
  const flat = useMemo(
    () => grouped.flatMap((entry) => entry.commands),
    [grouped]
  )

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      // Focus after the popup has mounted, otherwise the dialog steals it back.
      const handle = setTimeout(() => inputRef.current?.focus(), 20)
      return () => {
        clearTimeout(handle)
      }
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search and run operations commands. Use the arrow keys to move and
          Enter to run.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <SearchIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((index) => Math.min(index + 1, flat.length - 1))
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
                return
              }
              if (event.key === "Enter") {
                event.preventDefault()
                flat[activeIndex]?.run()
              }
            }}
            placeholder="Type a command…"
            aria-label="Command"
            aria-activedescendant={
              flat[activeIndex] ? `command-${flat[activeIndex].id}` : undefined
            }
            aria-controls="command-palette-list"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="ops-scroll max-h-[22rem] overflow-y-auto p-1"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No command matches “{query}”.
            </p>
          ) : (
            grouped.map((entry) => (
              <div key={entry.group} className="mb-1 last:mb-0">
                <p className="ops-label px-2 py-1">{entry.group}</p>
                {entry.commands.map((command) => {
                  const index = flat.indexOf(command)
                  const active = index === activeIndex
                  return (
                    <button
                      key={command.id}
                      id={`command-${command.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={command.run}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                        active ? "bg-accent" : "hover:bg-accent/60"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {command.label}
                        {command.hint ? (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            {command.hint}
                          </span>
                        ) : null}
                      </span>
                      {command.shortcut ? (
                        <kbd className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
                          {command.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
