import { create } from "zustand"
import {
  preferences,
  type AnalyticsRange,
} from "@/services/storage/preferences"
import type {
  DriverColumnId,
  DriverStatusFilter,
  RouteColumnId,
  SortDirection,
  TableViewState,
  TrafficLevel,
} from "@/types"

export type RouteTrafficFilter = TrafficLevel | "ALL"

export type { AnalyticsRange }

interface WorkspaceViewState {
  readonly roster: TableViewState<DriverColumnId>
  readonly driverStatus: DriverStatusFilter
  readonly routes: TableViewState<RouteColumnId>
  readonly routeTraffic: RouteTrafficFilter
  readonly analyticsRange: AnalyticsRange
  /** Which dimension the analytics breakdown is grouped by. */
  readonly analyticsDimension: "region" | "corridor"

  sortRoster(column: DriverColumnId): void
  setRosterPage(page: number): void
  setRosterPageSize(size: number): void
  setDriverStatus(status: DriverStatusFilter): void

  sortRoutes(column: RouteColumnId): void
  setRoutesPage(page: number): void
  setRoutesPageSize(size: number): void
  setRouteTraffic(level: RouteTrafficFilter): void

  setAnalyticsRange(range: AnalyticsRange): void
  setAnalyticsDimension(dimension: "region" | "corridor"): void
}

/**
 * Toggles the sort direction when the same column is pressed again, and starts
 * a new column ascending. Paging returns to the first row either way — staying
 * on page 7 of a freshly reordered table shows rows nobody asked for.
 */
function applySort<TColumn extends string>(
  state: TableViewState<TColumn>,
  column: TColumn
): TableViewState<TColumn> {
  const sameColumn = state.sortBy === column
  const sortDirection: SortDirection = sameColumn
    ? state.sortDirection === "asc"
      ? "desc"
      : "asc"
    : "asc"

  return { ...state, sortBy: column, sortDirection, page: 0 }
}

/**
 * View state for the surfaces that are not the map or the delivery board.
 *
 * Kept out of `ui-store` on purpose. That store already owns selection,
 * filters, panels and the board; folding four more tables into it would push it
 * past the point where a reader can hold it in their head, and none of this
 * state is needed by anything outside its own tab.
 */
export const useWorkspaceStore = create<WorkspaceViewState>()((set) => ({
  roster: { sortBy: "active", sortDirection: "desc", page: 0, pageSize: 25 },
  driverStatus: "ALL",
  routes: { sortBy: "traffic", sortDirection: "desc", page: 0, pageSize: 25 },
  routeTraffic: "ALL",
  analyticsRange: "session",
  analyticsDimension: "region",

  sortRoster: (column) => {
    set((state) => ({ roster: applySort(state.roster, column) }))
  },
  setRosterPage: (page) => {
    set((state) => ({ roster: { ...state.roster, page: Math.max(0, page) } }))
  },
  setRosterPageSize: (pageSize) => {
    set((state) => ({ roster: { ...state.roster, pageSize, page: 0 } }))
  },
  setDriverStatus: (driverStatus) => {
    set((state) => ({
      driverStatus,
      roster: { ...state.roster, page: 0 },
    }))
  },

  sortRoutes: (column) => {
    set((state) => ({ routes: applySort(state.routes, column) }))
  },
  setRoutesPage: (page) => {
    set((state) => ({ routes: { ...state.routes, page: Math.max(0, page) } }))
  },
  setRoutesPageSize: (pageSize) => {
    set((state) => ({ routes: { ...state.routes, pageSize, page: 0 } }))
  },
  setRouteTraffic: (routeTraffic) => {
    set((state) => ({ routeTraffic, routes: { ...state.routes, page: 0 } }))
  },

  setAnalyticsRange: (analyticsRange) => {
    preferences.saveAnalyticsRange(analyticsRange)
    set({ analyticsRange })
  },
  setAnalyticsDimension: (analyticsDimension) => {
    set({ analyticsDimension })
  },
}))

/** Restores the one preference here that is worth surviving a reload. */
export function hydrateWorkspaceStore(): void {
  useWorkspaceStore.setState({
    analyticsRange: preferences.loadAnalyticsRange(),
  })
}
