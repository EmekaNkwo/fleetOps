"use client"

import { useCallback, useEffect, useState } from "react"
import { hasActiveFilters } from "@/lib/filtering"
import {
  savedViews as storage,
  MAX_VIEW_NAME_LENGTH,
  type SavedView,
} from "@/services/storage/saved-views"
import { useActionJournal } from "@/stores/action-journal"
import { useUiStore } from "@/stores"
import { notify } from "@/stores/toast-store"

export interface UseSavedViewsResult {
  readonly views: readonly SavedView[]
  readonly atLimit: boolean
  /** True when the current filters are worth saving at all. */
  readonly canSave: boolean
  /** The view whose filters match the current ones, if any. */
  readonly activeViewId: string | null
  save(name: string): void
  apply(viewId: string): void
  remove(viewId: string): void
}

let counter = 0

/** Same filters, same surface — order of regions is not significant. */
function matches(view: SavedView, current: SavedView["filters"]): boolean {
  return (
    view.filters.vehicleStatus === current.vehicleStatus &&
    view.filters.deliveryStatus === current.deliveryStatus &&
    view.filters.query === current.query &&
    view.filters.regions.length === current.regions.length &&
    view.filters.regions.every((region) => current.regions.includes(region))
  )
}

/**
 * Named filter presets.
 *
 * Stored locally rather than in a store so they survive a reload — they are
 * the operator's own saved questions, and losing them on refresh would make
 * them not worth creating. Deleting one is undoable, because it is the only
 * destructive action in this feature and the name is easy to mis-click.
 */
export function useSavedViews(): UseSavedViewsResult {
  const [views, setViews] = useState<readonly SavedView[]>([])

  const filters = useUiStore((state) => state.filters)
  const workspace = useUiStore((state) => state.workspace)
  const setVehicleStatusFilter = useUiStore((state) => state.setVehicleStatusFilter)
  const setDeliveryStatusFilter = useUiStore(
    (state) => state.setDeliveryStatusFilter
  )
  const setRegions = useUiStore((state) => state.setRegions)
  const setQuery = useUiStore((state) => state.setQuery)
  const setWorkspace = useUiStore((state) => state.setWorkspace)
  const record = useActionJournal((state) => state.record)

  // Read once on mount: `localStorage` is unavailable during prerender, and a
  // lazy initialiser would run on the server pass.
  useEffect(() => {
    setViews(storage.load())
  }, [])

  const persist = useCallback((next: readonly SavedView[]): void => {
    setViews(next)
    storage.save(next)
  }, [])

  const save = useCallback(
    (rawName: string): void => {
      const name = rawName.trim().slice(0, MAX_VIEW_NAME_LENGTH)
      if (name.length === 0) {
        return
      }

      counter += 1
      const view: SavedView = {
        id: `view-${Date.now()}-${counter}`,
        name,
        createdAt: Date.now(),
        filters,
        workspace,
      }

      // Saving over an existing name replaces it. Two views called "Lagos
      // critical" showing different things is worse than losing the old one.
      const next = [
        view,
        ...views.filter(
          (existing) => existing.name.toLowerCase() !== name.toLowerCase()
        ),
      ].slice(0, storage.limit)

      persist(next)
      notify({ tone: "success", message: `Saved view “${name}”` })
    },
    [filters, workspace, views, persist]
  )

  const apply = useCallback(
    (viewId: string): void => {
      const view = views.find((candidate) => candidate.id === viewId)
      if (!view) {
        return
      }

      setVehicleStatusFilter(view.filters.vehicleStatus)
      setDeliveryStatusFilter(view.filters.deliveryStatus)
      setRegions(view.filters.regions)
      setQuery(view.filters.query)
      setWorkspace(view.workspace)

      notify({
        tone: "info",
        message: `Applied “${view.name}”`,
        detail: "Filters and surface restored. The data is current.",
      })
    },
    [
      views,
      setVehicleStatusFilter,
      setDeliveryStatusFilter,
      setRegions,
      setQuery,
      setWorkspace,
    ]
  )

  const remove = useCallback(
    (viewId: string): void => {
      const view = views.find((candidate) => candidate.id === viewId)
      if (!view) {
        return
      }

      persist(views.filter((candidate) => candidate.id !== viewId))

      const entryId = record({
        label: `Deleted view “${view.name}”`,
        refusalHint: "There is no room left for another saved view.",
        undo: () => {
          const current = storage.load()
          if (current.length >= storage.limit) {
            return false
          }
          const restored = [view, ...current]
          setViews(restored)
          storage.save(restored)
          return true
        },
      })

      notify({
        tone: "warning",
        message: `Deleted “${view.name}”`,
        action: {
          label: "Undo",
          run: () => {
            const applied = useActionJournal.getState().undoEntry(entryId)
            if (applied) {
              notify({ tone: "success", message: `Restored “${view.name}”` })
            }
          },
        },
      })
    },
    [views, persist, record]
  )

  return {
    views,
    atLimit: views.length >= storage.limit,
    canSave: hasActiveFilters(filters),
    activeViewId:
      views.find((view) => matches(view, filters))?.id ?? null,
    save,
    apply,
    remove,
  }
}
