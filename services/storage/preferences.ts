import {
  DEFAULT_FLEET_PAGE_SIZE,
  DEFAULT_TOGGLES,
  FLEET_PAGE_SIZES,
} from "@/data/config"
import { REGIONS } from "@/data/geography"
import { DELIVERY_STATUS_ORDER, VEHICLE_STATUS_ORDER } from "@/lib/status-tokens"
import type {
  DeliveryColumnId,
  DeliveryStatusFilter,
  EventRate,
  OperationsFilters,
  RegionId,
  SimulationConfig,
  SimulationToggles,
  VehicleStatusFilter,
  WorkspaceTab,
} from "@/types"
import {
  clampThresholds,
  DEFAULT_THRESHOLDS,
  type AlertThresholds,
} from "@/services/simulation/thresholds"
import { readValue, writeValue } from "./local-storage"

/** Mirrors `AnalyticsRange` in the workspace store, which imports from here. */
export type AnalyticsRange = "15m" | "1h" | "session"

const KEYS = {
  fleet: "fleet",
  notifications: "notifications",
  filters: "filters",
  simulation: "simulation",
  table: "table",
  workspace: "workspace",
  acknowledgedAlerts: "acknowledged-alerts",
  introSeen: "intro-seen",
  analyticsRange: "analytics-range",
  thresholds: "alert-thresholds",
} as const

const REGION_IDS = new Set<string>(REGIONS.map((region) => region.id))
const VEHICLE_STATUSES = new Set<string>([...VEHICLE_STATUS_ORDER, "ALL"])
const DELIVERY_STATUSES = new Set<string>([...DELIVERY_STATUS_ORDER, "ALL"])
const RATES = new Set<string>(["slow", "normal", "fast"])
const TABS = new Set<string>([
  "map",
  "deliveries",
  "drivers",
  "routes",
  "analytics",
])
const ANALYTICS_RANGES = new Set<string>(["15m", "1h", "session"])
const COLUMNS = new Set<string>([
  "reference",
  "customer",
  "priority",
  "origin",
  "region",
  "destination",
  "driver",
  "vehicle",
  "status",
  "eta",
  "delay",
])

export const DEFAULT_FILTERS: OperationsFilters = {
  vehicleStatus: "ALL",
  deliveryStatus: "ALL",
  regions: [],
  query: "",
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  rate: "normal",
  toggles: DEFAULT_TOGGLES,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseFilters(raw: unknown): OperationsFilters | null {
  if (!isRecord(raw)) {
    return null
  }

  const vehicleStatus =
    typeof raw.vehicleStatus === "string" && VEHICLE_STATUSES.has(raw.vehicleStatus)
      ? (raw.vehicleStatus as VehicleStatusFilter)
      : DEFAULT_FILTERS.vehicleStatus

  const deliveryStatus =
    typeof raw.deliveryStatus === "string" &&
    DELIVERY_STATUSES.has(raw.deliveryStatus)
      ? (raw.deliveryStatus as DeliveryStatusFilter)
      : DEFAULT_FILTERS.deliveryStatus

  const regions = Array.isArray(raw.regions)
    ? raw.regions.filter(
        (region): region is RegionId =>
          typeof region === "string" && REGION_IDS.has(region)
      )
    : []

  // The query is session scoped on purpose: restoring a stale search on reload
  // would hide most of the board with no obvious cause.
  return { vehicleStatus, deliveryStatus, regions, query: "" }
}

function parseToggles(raw: unknown): SimulationToggles {
  if (!isRecord(raw)) {
    return DEFAULT_TOGGLES
  }
  const read = (key: keyof SimulationToggles): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_TOGGLES[key]

  return {
    randomDelays: read("randomDelays"),
    vehicleFailures: read("vehicleFailures"),
    trafficSpikes: read("trafficSpikes"),
    newDeliveries: read("newDeliveries"),
    deliveryCompletions: read("deliveryCompletions"),
  }
}

function parseSimulation(raw: unknown): SimulationConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const rate =
    typeof raw.rate === "string" && RATES.has(raw.rate)
      ? (raw.rate as EventRate)
      : DEFAULT_SIMULATION_CONFIG.rate

  return { rate, toggles: parseToggles(raw.toggles) }
}

export interface NotificationPreferences {
  /** Play a tone when a CRITICAL alert is raised. */
  readonly sound: boolean
  /** Raise an OS notification when the console is in a background tab. */
  readonly desktop: boolean
}

/** Both channels are off until the operator asks for them. */
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  sound: false,
  desktop: false,
}

function parseNotifications(raw: unknown): NotificationPreferences | null {
  if (!isRecord(raw)) {
    return null
  }
  return {
    sound:
      typeof raw.sound === "boolean" ? raw.sound : DEFAULT_NOTIFICATIONS.sound,
    desktop:
      typeof raw.desktop === "boolean"
        ? raw.desktop
        : DEFAULT_NOTIFICATIONS.desktop,
  }
}

export interface FleetPreferences {
  readonly pageSize: number
}

export const DEFAULT_FLEET_PREFERENCES: FleetPreferences = {
  pageSize: DEFAULT_FLEET_PAGE_SIZE,
}

function parseFleet(raw: unknown): FleetPreferences | null {
  if (!isRecord(raw)) {
    return null
  }
  return {
    pageSize:
      typeof raw.pageSize === "number" &&
      FLEET_PAGE_SIZES.includes(raw.pageSize)
        ? raw.pageSize
        : DEFAULT_FLEET_PREFERENCES.pageSize,
  }
}

export interface TablePreferences {
  readonly pageSize: number
  readonly hiddenColumns: readonly DeliveryColumnId[]
}

export const DEFAULT_TABLE_PREFERENCES: TablePreferences = {
  pageSize: 25,
  hiddenColumns: [],
}

function parseTable(raw: unknown): TablePreferences | null {
  if (!isRecord(raw)) {
    return null
  }
  const pageSize =
    typeof raw.pageSize === "number" && [10, 25, 50, 100].includes(raw.pageSize)
      ? raw.pageSize
      : DEFAULT_TABLE_PREFERENCES.pageSize

  const hiddenColumns = Array.isArray(raw.hiddenColumns)
    ? raw.hiddenColumns.filter(
        (column): column is DeliveryColumnId =>
          typeof column === "string" && COLUMNS.has(column)
      )
    : []

  return { pageSize, hiddenColumns }
}

export const preferences = {
  loadFilters: (): OperationsFilters =>
    readValue(KEYS.filters, parseFilters, DEFAULT_FILTERS),
  saveFilters: (filters: OperationsFilters): void => {
    writeValue(KEYS.filters, {
      vehicleStatus: filters.vehicleStatus,
      deliveryStatus: filters.deliveryStatus,
      regions: filters.regions,
    })
  },

  loadSimulation: (): SimulationConfig =>
    readValue(KEYS.simulation, parseSimulation, DEFAULT_SIMULATION_CONFIG),
  saveSimulation: (config: SimulationConfig): void => {
    writeValue(KEYS.simulation, config)
  },

  loadTable: (): TablePreferences =>
    readValue(KEYS.table, parseTable, DEFAULT_TABLE_PREFERENCES),
  saveTable: (table: TablePreferences): void => {
    writeValue(KEYS.table, table)
  },

  loadWorkspace: (): WorkspaceTab =>
    readValue(
      KEYS.workspace,
      (raw) =>
        typeof raw === "string" && TABS.has(raw) ? (raw as WorkspaceTab) : null,
      "map"
    ),
  saveWorkspace: (tab: WorkspaceTab): void => {
    writeValue(KEYS.workspace, tab)
  },

  loadAcknowledgedAlerts: (): readonly string[] =>
    readValue(
      KEYS.acknowledgedAlerts,
      (raw) =>
        Array.isArray(raw)
          ? raw.filter((id): id is string => typeof id === "string")
          : null,
      []
    ),
  saveAcknowledgedAlerts: (ids: readonly string[]): void => {
    // Bounded so the key cannot grow without limit across long sessions.
    writeValue(KEYS.acknowledgedAlerts, ids.slice(-200))
  },

  loadFleet: (): FleetPreferences =>
    readValue(KEYS.fleet, parseFleet, DEFAULT_FLEET_PREFERENCES),
  saveFleet: (fleet: FleetPreferences): void => {
    writeValue(KEYS.fleet, fleet)
  },

  loadNotifications: (): NotificationPreferences =>
    readValue(KEYS.notifications, parseNotifications, DEFAULT_NOTIFICATIONS),
  saveNotifications: (notifications: NotificationPreferences): void => {
    writeValue(KEYS.notifications, notifications)
  },

  loadThresholds: (): AlertThresholds =>
    readValue(
      KEYS.thresholds,
      (raw) => (isRecord(raw) ? clampThresholds(raw as Partial<AlertThresholds>) : null),
      DEFAULT_THRESHOLDS
    ),
  saveThresholds: (thresholds: AlertThresholds): void => {
    writeValue(KEYS.thresholds, thresholds)
  },

  loadAnalyticsRange: (): AnalyticsRange =>
    readValue(
      KEYS.analyticsRange,
      (raw) =>
        typeof raw === "string" && ANALYTICS_RANGES.has(raw)
          ? (raw as AnalyticsRange)
          : null,
      "session"
    ),
  saveAnalyticsRange: (range: AnalyticsRange): void => {
    writeValue(KEYS.analyticsRange, range)
  },

  loadIntroSeen: (): boolean =>
    readValue(KEYS.introSeen, (raw) => (typeof raw === "boolean" ? raw : null), false),
  saveIntroSeen: (seen: boolean): void => {
    writeValue(KEYS.introSeen, seen)
  },
}
