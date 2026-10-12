"use client"

import { useEffect, useRef, useState } from "react"
import { BookmarkIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_VIEW_NAME_LENGTH } from "@/services/storage/saved-views"
import { useSavedViews } from "@/hooks/use-saved-views"

/**
 * Saved views.
 *
 * Written as a popover rather than reusing the shared `Menu`: this one holds a
 * text field and per-row delete buttons, and a menu whose items are not all
 * menu items is a menu that lies to a screen reader. It is a labelled group of
 * controls, so that is what it exposes.
 */
export function SavedViewsMenu() {
  const views = useSavedViews()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [open])

  const commitSave = (): void => {
    if (name.trim().length === 0 || views.atLimit) {
      return
    }
    views.save(name)
    setName("")
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Saved views"
        onClick={() => setOpen((current) => !current)}
      >
        <BookmarkIcon
          aria-hidden="true"
          className={cn(views.activeViewId && "text-primary")}
        />
      </Button>

      {open ? (
        <div
          role="group"
          aria-label="Saved views"
          className={cn(
            "absolute top-full right-0 z-50 mt-1 w-72 rounded border border-border bg-popover p-2 shadow-lg",
            "animate-in duration-100 fade-in-0 zoom-in-95 motion-reduce:animate-none"
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
            }
          }}
        >
          <p className="ops-label mb-1.5">Save this view</p>
          <div className="flex gap-1">
            <input
              type="text"
              value={name}
              maxLength={MAX_VIEW_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitSave()
                }
              }}
              placeholder={
                views.canSave ? "Lagos critical" : "Set a filter first"
              }
              aria-label="Name for this view"
              className="min-w-0 flex-1 rounded border border-border bg-card px-1.5 py-1 text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <Button
              variant="outline"
              size="xs"
              onClick={commitSave}
              disabled={name.trim().length === 0 || views.atLimit}
            >
              <PlusIcon aria-hidden="true" />
              Save
            </Button>
          </div>

          <p className="mt-1 text-[10px] text-muted-foreground">
            {views.atLimit
              ? "The list is full — delete a view to save another."
              : views.canSave
                ? "Captures the filters and the current tab, not the rows."
                : "Nothing is filtered, so this view would match everything."}
          </p>

          <div className="my-2 h-px bg-border" />

          {views.views.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              No saved views yet. Filter the board down to something you check
              often, then save it here.
            </p>
          ) : (
            <ul className="ops-scroll max-h-56 space-y-0.5 overflow-y-auto">
              {views.views.map((view) => {
                const active = views.activeViewId === view.id
                return (
                  <li key={view.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        views.apply(view.id)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors",
                        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active && "bg-accent"
                      )}
                    >
                      {active ? (
                        <CheckIcon
                          className="size-3 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="size-3 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {view.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                        {view.workspace}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => views.remove(view.id)}
                      aria-label={`Delete view ${view.name}`}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
