/**
 * Named snapshots of what the operator is looking at.
 *
 * A view captures the question, not the answer: the filters and the surface,
 * never the rows that happened to match when it was saved. Restoring it a shift
 * later re-asks the same question of a world that has moved on, which is the
 * only behaviour that makes sense for live operations data.
 */
import { REGIONS } from "@/data/geography"
import { DELIVERY_STATUS_ORDER, VEHICLE_STATUS_ORDER } from "@/lib/status-tokens"
import type {
  DeliveryStatusFilter,
  OperationsFilters,
  RegionId,
  VehicleStatusFilter,
  WorkspaceTab,
} from "@/types"
import { readValue, writeValue } from "./local-storage"

const KEY = "saved-views"

/** Bounded so one key cannot grow without limit across long sessions. */
const MAX_VIEWS = 20

export const MAX_VIEW_NAME_LENGTH = 40

export interface SavedView {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly filters: OperationsFilters
  readonly workspace: WorkspaceTab
}

const REGION_IDS = new Set<string>(REGIONS.map((region) => region.id))
const VEHICLE_STATUSES = new Set<string>([...VEHICLE_STATUS_ORDER, "ALL"])
const DELIVERY_STATUSES = new Set<string>([...DELIVERY_STATUS_ORDER, "ALL"])
const TABS = new Set<string>([
  "map",
  "deliveries",
  "drivers",
  "routes",
  "analytics",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Validates one stored view. Anything malformed is dropped rather than
 * repaired: a half-understood filter would silently show the operator a
 * different slice of the fleet than the name on it promises.
 */
function parseView(raw: unknown): SavedView | null {
  if (!isRecord(raw)) {
    return null
  }

  const { id, name, createdAt, filters, workspace } = raw
  if (typeof id !== "string" || typeof name !== "string" || name.length === 0) {
    return null
  }
  if (!isRecord(filters)) {
    return null
  }

  const vehicleStatus =
    typeof filters.vehicleStatus === "string" &&
    VEHICLE_STATUSES.has(filters.vehicleStatus)
      ? (filters.vehicleStatus as VehicleStatusFilter)
      : "ALL"

  const deliveryStatus =
    typeof filters.deliveryStatus === "string" &&
    DELIVERY_STATUSES.has(filters.deliveryStatus)
      ? (filters.deliveryStatus as DeliveryStatusFilter)
      : "ALL"

  const regions = Array.isArray(filters.regions)
    ? filters.regions.filter(
        (region): region is RegionId =>
          typeof region === "string" && REGION_IDS.has(region)
      )
    : []

  return {
    id,
    name: name.slice(0, MAX_VIEW_NAME_LENGTH),
    createdAt: typeof createdAt === "number" ? createdAt : 0,
    filters: {
      vehicleStatus,
      deliveryStatus,
      regions,
      query: typeof filters.query === "string" ? filters.query : "",
    },
    workspace:
      typeof workspace === "string" && TABS.has(workspace)
        ? (workspace as WorkspaceTab)
        : "map",
  }
}

export const savedViews = {
  load: (): readonly SavedView[] =>
    readValue(
      KEY,
      (raw) =>
        Array.isArray(raw)
          ? raw
              .map(parseView)
              .filter((view): view is SavedView => view !== null)
              .slice(0, MAX_VIEWS)
          : null,
      []
    ),

  save: (views: readonly SavedView[]): void => {
    writeValue(KEY, views.slice(0, MAX_VIEWS))
  },

  limit: MAX_VIEWS,
}
