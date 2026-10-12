"use client"

import { useEffect, useRef } from "react"
import { SearchIcon, SearchXIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { Spinner } from "@/components/shared/spinner"
import { useSearch } from "@/hooks"

export interface GlobalSearchProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
}

/**
 * Global search dialog. Results are grouped by entity type and opening one
 * routes to the right place — a vehicle flies the map to it, a customer filters
 * the delivery board by their name.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <SearchDialogBody /> : null}
    </Dialog>
  )
}

/**
 * Mounted only while the dialog is open.
 *
 * `useSearch` builds an index over every vehicle, driver, delivery, customer
 * and route — about 1,700 records. Keeping this mounted meant rebuilding that
 * index on every store commit, several times a second, for a dialog nobody was
 * looking at.
 */
function SearchDialogBody() {
  const search = useSearch()
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => inputRef.current?.focus(), 20)
    return () => {
      clearTimeout(handle)
    }
  }, [])

  return (
    <>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search operations</DialogTitle>
        <DialogDescription className="sr-only">
          Search across vehicles, drivers, deliveries, customers and routes.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          {search.isSearching ? (
            <Spinner
              size="sm"
              label="Searching"
              className="text-muted-foreground"
            />
          ) : (
            <SearchIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <input
            ref={inputRef}
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const first = search.results[0]
                if (first) {
                  event.preventDefault()
                  search.open(first)
                }
              }
            }}
            placeholder="Vehicle 192, Chukwuemeka, DEL-28492, ABC Foods…"
            aria-label="Search vehicles, drivers, deliveries and routes"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search.total > 0 ? (
            <span className="ops-figure shrink-0 text-[11px] text-muted-foreground">
              {search.total} result{search.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div
          className="ops-scroll max-h-[24rem] overflow-y-auto p-1"
          role="listbox"
          aria-label="Search results"
        >
          {search.query.trim().length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Search across vehicles, drivers, deliveries, customers and routes.
            </p>
          ) : search.isEmpty ? (
            <EmptyState
              icon={SearchXIcon}
              title={`Nothing matches “${search.debouncedQuery}”`}
              description="Try a vehicle call sign, a delivery reference such as DEL-28492, a driver surname or a customer name."
              compact
            />
          ) : (
            search.groups.map((group) => (
              <div key={group.kind} className="mb-1 last:mb-0">
                <p className="ops-label px-2 py-1">{group.label}</p>
                {group.results.map((result) => (
                  <button
                    key={`${result.kind}-${result.id}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => search.open(result)}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="ops-figure shrink-0 font-medium">
                      {result.title}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {result.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </>
  )
}
