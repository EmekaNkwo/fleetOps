"use client"

import { useCallback, useMemo } from "react"
import { REGIONS } from "@/data/geography"
import { describeFilters, hasActiveFilters } from "@/lib/filtering"
import { useUiStore } from "@/stores"
import type {
  OperationsFilters,
  Region,
  RegionId,
  SidePanel,
  WorkspaceTab,
} from "@/types"

export interface OperationsWorkspace {
  readonly tab: WorkspaceTab
  readonly panel: SidePanel
  setTab(tab: WorkspaceTab): void
  openPanel(panel: Exclude<SidePanel, null>): void
  togglePanel(panel: Exclude<SidePanel, null>): void
  closePanel(): void
}

export interface OperationsFiltersApi {
  readonly value: OperationsFilters
  readonly regions: readonly Region[]
  readonly activeCount: number
  readonly isActive: boolean
  setQuery(query: string): void
  toggleRegion(region: RegionId): void
  reset(): void
}

/**
 * Workspace navigation: which tab is open and which side panel is showing.
 *
 * Split out of the old monolithic `useOperations` so that the chrome can
 * subscribe to navigation without also subscribing to the fleet, the board and
 * the alert queue — the previous arrangement re-rendered the entire tree on
 * every simulation commit, roughly eight times a second.
 */
export function useOperationsWorkspace(): OperationsWorkspace {
  const tab = useUiStore((state) => state.workspace)
  const panel = useUiStore((state) => state.panel)
  const setTab = useUiStore((state) => state.setWorkspace)
  const openPanel = useUiStore((state) => state.openPanel)
  const togglePanel = useUiStore((state) => state.togglePanel)
  const closePanel = useUiStore((state) => state.closePanel)

  return useMemo(
    () => ({ tab, panel, setTab, openPanel, togglePanel, closePanel }),
    [tab, panel, setTab, openPanel, togglePanel, closePanel]
  )
}

/** The shared filter surface: status, region and the free-text query. */
export function useOperationsFilters(): OperationsFiltersApi {
  const value = useUiStore((state) => state.filters)
  const setQuery = useUiStore((state) => state.setQuery)
  const toggleRegion = useUiStore((state) => state.toggleRegion)
  const resetFilters = useUiStore((state) => state.resetFilters)

  const reset = useCallback((): void => {
    resetFilters()
  }, [resetFilters])

  return useMemo(
    () => ({
      value,
      regions: REGIONS,
      activeCount: describeFilters(
        value.vehicleStatus,
        value.deliveryStatus,
        value.regions
      ),
      isActive: hasActiveFilters(value),
      setQuery,
      toggleRegion,
      reset,
    }),
    [value, setQuery, toggleRegion, reset]
  )
}
