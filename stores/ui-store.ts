import { create } from "zustand"
import {
  DEFAULT_FILTERS,
  DEFAULT_FLEET_PREFERENCES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_TABLE_PREFERENCES,
  preferences,
  type NotificationPreferences,
} from "@/services/storage/preferences"
import type {
  DeliveryColumnId,
  DeliveryStatusFilter,
  DeliveryTableState,
  FleetListState,
  OperationsFilters,
  RegionId,
  Selection,
  SeverityFilter,
  SidePanel,
  SortDirection,
  VehicleStatusFilter,
  WorkspaceTab,
} from "@/types"

/** A request for the map to fly somewhere. Consumed once, then cleared. */
export interface MapFocusRequest {
  readonly vehicleId: string
  readonly requestedAt: number
}

interface UiState {
  readonly selection: Selection | null
  readonly filters: OperationsFilters
  readonly panel: SidePanel
  readonly workspace: WorkspaceTab
  readonly commandPaletteOpen: boolean
  readonly searchOpen: boolean
  readonly introVisible: boolean
  readonly handoverVisible: boolean
  readonly alertSeverityFilter: SeverityFilter
  readonly table: DeliveryTableState
  readonly fleet: FleetListState
  readonly mapFocus: MapFocusRequest | null
  readonly showRoutes: boolean
  readonly densityView: boolean
  readonly followSelection: boolean
  readonly notifications: NotificationPreferences

  selectVehicle(vehicleId: string): void
  selectDelivery(deliveryId: string): void
  selectIncident(incidentId: string): void
  selectDriver(driverId: string): void
  clearSelection(): void
  setNotificationPreference(
    key: keyof NotificationPreferences,
    value: boolean
  ): void

  setVehicleStatusFilter(status: VehicleStatusFilter): void
  setDeliveryStatusFilter(status: DeliveryStatusFilter): void
  toggleRegion(region: RegionId): void
  setRegions(regions: readonly RegionId[]): void
  setQuery(query: string): void
  resetFilters(): void

  openPanel(panel: Exclude<SidePanel, null>): void
  togglePanel(panel: Exclude<SidePanel, null>): void
  closePanel(): void
  setWorkspace(tab: WorkspaceTab): void

  setCommandPaletteOpen(open: boolean): void
  setSearchOpen(open: boolean): void
  setHandoverVisible(visible: boolean): void
  dismissIntro(): void
  showIntro(): void

  setAlertSeverityFilter(severity: SeverityFilter): void

  setFleetPage(page: number): void
  setFleetPageSize(size: number): void

  sortTable(column: DeliveryColumnId): void
  setTablePage(page: number): void
  setTablePageSize(size: number): void
  toggleColumn(column: DeliveryColumnId): void
  toggleRowSelection(deliveryId: string): void
  /** Adds every id, or removes them all if they are already selected. */
  toggleRowSelections(deliveryIds: readonly string[]): void
  clearRowSelection(): void

  focusVehicleOnMap(vehicleId: string): void
  consumeMapFocus(): void
  setShowRoutes(show: boolean): void
  setDensityView(density: boolean): void
  setFollowSelection(follow: boolean): void

  /** Closes whatever is on top — the Escape key handler. */
  dismissTopLayer(): boolean
}

function initialTable(): DeliveryTableState {
  const stored = preferences.loadTable()
  return {
    sortBy: "eta",
    sortDirection: "asc",
    page: 0,
    pageSize: stored.pageSize,
    hiddenColumns: stored.hiddenColumns,
    selectedIds: [],
  }
}

function persistFilters(filters: OperationsFilters): OperationsFilters {
  preferences.saveFilters(filters)
  return filters
}

export const useUiStore = create<UiState>()((set, get) => ({
  selection: null,
  filters: DEFAULT_FILTERS,
  panel: null,
  workspace: "map",
  commandPaletteOpen: false,
  searchOpen: false,
  introVisible: false,
  handoverVisible: false,
  alertSeverityFilter: "ALL",
  table: { ...DEFAULT_TABLE_PREFERENCES, ...initialTable() },
  fleet: { page: 0, pageSize: DEFAULT_FLEET_PREFERENCES.pageSize },
  mapFocus: null,
  showRoutes: true,
  densityView: false,
  followSelection: false,
  notifications: DEFAULT_NOTIFICATIONS,

  selectVehicle: (vehicleId) => {
    set({ selection: { kind: "vehicle", id: vehicleId } })
  },
  selectDelivery: (deliveryId) => {
    set({ selection: { kind: "delivery", id: deliveryId } })
  },
  selectIncident: (incidentId) => {
    set({ selection: { kind: "incident", id: incidentId } })
  },
  selectDriver: (driverId) => {
    set({ selection: { kind: "driver", id: driverId } })
  },
  setNotificationPreference: (key, value) => {
    set((state) => {
      const notifications = { ...state.notifications, [key]: value }
      preferences.saveNotifications(notifications)
      return { notifications }
    })
  },
  clearSelection: () => {
    set({ selection: null })
  },

  setVehicleStatusFilter: (vehicleStatus) => {
    set((state) => ({
      filters: persistFilters({ ...state.filters, vehicleStatus }),
      fleet: { ...state.fleet, page: 0 },
    }))
  },
  setDeliveryStatusFilter: (deliveryStatus) => {
    set((state) => ({
      filters: persistFilters({ ...state.filters, deliveryStatus }),
      table: { ...state.table, page: 0 },
    }))
  },
  toggleRegion: (region) => {
    set((state) => {
      const active = state.filters.regions.includes(region)
      const regions = active
        ? state.filters.regions.filter((entry) => entry !== region)
        : [...state.filters.regions, region]
      return {
        filters: persistFilters({ ...state.filters, regions }),
        table: { ...state.table, page: 0 },
        fleet: { ...state.fleet, page: 0 },
      }
    })
  },
  setRegions: (regions) => {
    set((state) => ({
      filters: persistFilters({ ...state.filters, regions }),
      table: { ...state.table, page: 0 },
    }))
  },
  setQuery: (query) => {
    set((state) => ({
      filters: { ...state.filters, query },
      table: { ...state.table, page: 0 },
      fleet: { ...state.fleet, page: 0 },
    }))
  },
  resetFilters: () => {
    set((state) => ({
      filters: persistFilters(DEFAULT_FILTERS),
      table: { ...state.table, page: 0 },
      fleet: { ...state.fleet, page: 0 },
    }))
  },

  openPanel: (panel) => {
    set({ panel })
  },
  togglePanel: (panel) => {
    set((state) => ({ panel: state.panel === panel ? null : panel }))
  },
  closePanel: () => {
    set({ panel: null })
  },
  setWorkspace: (workspace) => {
    preferences.saveWorkspace(workspace)
    set({ workspace })
  },

  setCommandPaletteOpen: (commandPaletteOpen) => {
    set({ commandPaletteOpen })
  },
  setSearchOpen: (searchOpen) => {
    set({ searchOpen })
  },
  setHandoverVisible: (handoverVisible) => {
    set({ handoverVisible })
  },
  dismissIntro: () => {
    preferences.saveIntroSeen(true)
    set({ introVisible: false })
  },
  showIntro: () => {
    set({ introVisible: true })
  },

  setAlertSeverityFilter: (alertSeverityFilter) => {
    set({ alertSeverityFilter })
  },

  setFleetPage: (page) => {
    set((state) => ({ fleet: { ...state.fleet, page: Math.max(0, page) } }))
  },
  setFleetPageSize: (pageSize) => {
    preferences.saveFleet({ pageSize })
    set({ fleet: { page: 0, pageSize } })
  },

  sortTable: (column) => {
    set((state) => {
      const sameColumn = state.table.sortBy === column
      const sortDirection: SortDirection = sameColumn
        ? state.table.sortDirection === "asc"
          ? "desc"
          : "asc"
        : "asc"
      return {
        table: { ...state.table, sortBy: column, sortDirection, page: 0 },
      }
    })
  },
  setTablePage: (page) => {
    set((state) => ({ table: { ...state.table, page: Math.max(0, page) } }))
  },
  setTablePageSize: (pageSize) => {
    set((state) => {
      const table = { ...state.table, pageSize, page: 0 }
      preferences.saveTable({
        pageSize,
        hiddenColumns: table.hiddenColumns,
      })
      return { table }
    })
  },
  toggleColumn: (column) => {
    set((state) => {
      const hidden = state.table.hiddenColumns.includes(column)
      const hiddenColumns = hidden
        ? state.table.hiddenColumns.filter((entry) => entry !== column)
        : [...state.table.hiddenColumns, column]
      preferences.saveTable({ pageSize: state.table.pageSize, hiddenColumns })
      return { table: { ...state.table, hiddenColumns } }
    })
  },
  toggleRowSelection: (deliveryId) => {
    set((state) => {
      const selected = state.table.selectedIds.includes(deliveryId)
      const selectedIds = selected
        ? state.table.selectedIds.filter((id) => id !== deliveryId)
        : [...state.table.selectedIds, deliveryId]
      return { table: { ...state.table, selectedIds } }
    })
  },
  toggleRowSelections: (deliveryIds) => {
    set((state) => {
      const current = new Set(state.table.selectedIds)
      const allSelected = deliveryIds.every((id) => current.has(id))

      for (const id of deliveryIds) {
        if (allSelected) {
          current.delete(id)
        } else {
          current.add(id)
        }
      }

      return { table: { ...state.table, selectedIds: [...current] } }
    })
  },
  clearRowSelection: () => {
    set((state) => ({ table: { ...state.table, selectedIds: [] } }))
  },

  focusVehicleOnMap: (vehicleId) => {
    set({
      mapFocus: { vehicleId, requestedAt: Date.now() },
      selection: { kind: "vehicle", id: vehicleId },
    })
  },
  consumeMapFocus: () => {
    set({ mapFocus: null })
  },
  setShowRoutes: (showRoutes) => {
    set({ showRoutes })
  },
  setDensityView: (densityView) => {
    set({ densityView })
  },
  setFollowSelection: (followSelection) => {
    set({ followSelection })
  },

  dismissTopLayer: () => {
    const state = get()
    if (state.commandPaletteOpen) {
      set({ commandPaletteOpen: false })
      return true
    }
    if (state.searchOpen) {
      set({ searchOpen: false })
      return true
    }
    if (state.handoverVisible) {
      set({ handoverVisible: false })
      return true
    }
    if (state.introVisible) {
      get().dismissIntro()
      return true
    }

    // Only selections that render as their own overlay count as a layer. An
    // incident selection just expands a row inside the incident panel, so
    // clearing it here would consume the key without closing anything the
    // operator can see — which is exactly what it used to do when a panel was
    // open over a stale incident selection.
    if (state.selection && state.selection.kind !== "incident") {
      set({ selection: null })
      return true
    }

    if (state.panel) {
      set({
        panel: null,
        // The expansion belongs to the panel, so it closes with it.
        selection:
          state.selection?.kind === "incident" ? null : state.selection,
      })
      return true
    }

    if (state.selection) {
      set({ selection: null })
      return true
    }

    return false
  },
}))

/** Restores persisted UI preferences. Called once, client side, on mount. */
export function hydrateUiStore(): void {
  const filters = preferences.loadFilters()
  const workspace = preferences.loadWorkspace()
  const table = preferences.loadTable()
  const fleet = preferences.loadFleet()
  const introSeen = preferences.loadIntroSeen()
  const notifications = preferences.loadNotifications()

  useUiStore.setState((state) => ({
    filters,
    workspace,
    notifications,
    introVisible: !introSeen,
    fleet: { page: 0, pageSize: fleet.pageSize },
    table: {
      ...state.table,
      pageSize: table.pageSize,
      hiddenColumns: table.hiddenColumns,
    },
  }))
}
