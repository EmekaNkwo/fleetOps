/**
 * The business-logic surface the presentation layer consumes.
 *
 * Every hook the UI is allowed to reach for is listed here, along with the
 * result types components need to type their props. Internal helpers
 * (`useDebouncedValue`, `useFilterContext`, `useMediaQuery`) are deliberately
 * absent: they are implementation details of the hooks above them and are
 * imported directly by the few modules that compose them.
 */
export { useActivity } from "./use-activity"
export { useAlertNotifications } from "./use-alert-notifications"
export type { UseAlertNotificationsResult } from "./use-alert-notifications"
export { useAlertSettings } from "./use-alert-settings"
export { useAnalytics } from "./use-analytics"
export type { BreakdownRow } from "./use-analytics"
export { useAlerts } from "./use-alerts"
export type { UseAlertsResult } from "./use-alerts"
export { useBootstrap } from "./use-bootstrap"
export type { BootstrapProgress } from "./use-bootstrap"
export { useCommands } from "./use-commands"
export type { Command, CommandGroup } from "./use-commands"
export { useDeliveries } from "./use-deliveries"
export type { DeliveryDetail } from "./use-deliveries"
export { useDeliveryBoard } from "./use-delivery-board"
export type { UseDeliveryBoardResult } from "./use-delivery-board"
export { useDispatch } from "./use-dispatch"
export type { DispatchCandidate } from "./use-dispatch"
export { useDriverRoster } from "./use-driver-roster"
export type { DriverRosterRow } from "./use-driver-roster"
export { useDrivers } from "./use-drivers"
export type { DriverDetail } from "./use-drivers"
export { useIsCompact, useNow, usePrefersReducedMotion } from "./use-environment"
export { useExport } from "./use-export"
export type { ExportDataset, ExportOutcome } from "./use-export"
export { useFleet } from "./use-fleet"
export { useFuel } from "./use-fuel"
export type { FuelRow } from "./use-fuel"
export type { VehicleDetail } from "./use-fleet"
export { useGeofences } from "./use-geofences"
export { useIncidents } from "./use-incidents"
export type { RaiseIncidentInput } from "./use-incidents"
export type { IncidentDetail, UseIncidentsResult } from "./use-incidents"
export { SHORTCUTS, useKeyboardShortcuts } from "./use-keyboard-shortcuts"
export type { ShortcutDescription } from "./use-keyboard-shortcuts"
export { useMap } from "./use-map"
export type { RouteLine, UseMapResult } from "./use-map"
export { useMetrics } from "./use-metrics"
export type { KpiDefinition } from "./use-metrics"
export { useOperationsFilters, useOperationsWorkspace } from "./use-operations"
export type {
  OperationsFiltersApi,
  OperationsWorkspace,
} from "./use-operations"
export { useReplay } from "./use-replay"
export { useRoutes } from "./use-routes"
export type { RouteRow } from "./use-routes"
export { useSavedViews } from "./use-saved-views"
export { useSearch } from "./use-search"
export { useSimulation } from "./use-simulation"
export type { UseSimulationResult } from "./use-simulation"
export { useUndo } from "./use-undo"
