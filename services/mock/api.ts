import type {
  ActivityEvent,
  Alert,
  Customer,
  Delivery,
  Driver,
  Incident,
  Route,
  TrafficCondition,
  Vehicle,
} from "@/types"
import type { ReferenceCounters } from "./ids"
import type { VehicleKinematics } from "@/services/simulation/world"
import { generateBootstrapData, type BootstrapData } from "./dataset"

/**
 * Stands in for the operations backend.
 *
 * It exists so the data-fetching boundary in the app is a real async boundary
 * with real pagination — TanStack Query drives loading, progress, error and
 * retry against this exactly as it would against HTTP.
 *
 * Collections are served a page at a time rather than as one payload. A real
 * gateway would not return 680 deliveries in a single response, and pretending
 * otherwise would hide the only interesting part of the problem: assembling a
 * complete picture from partial responses without showing the operator a board
 * that is half populated.
 */
export interface MockApiOptions {
  /** Simulated per-request latency, in milliseconds. */
  readonly latencyMs?: number
  /** Probability a request fails, so the error state is reachable in dev. */
  readonly failureRate?: number
  readonly seed?: number
  readonly now?: number
}

/** One page of a collection, in the shape a cursor-paginated API would use. */
export interface Page<T> {
  readonly items: readonly T[]
  /** Offset to request next, or `null` when the collection is exhausted. */
  readonly nextCursor: number | null
  readonly total: number
}

export interface PageRequest {
  readonly cursor?: number
  readonly limit?: number
}

/** Everything that is small enough to arrive in one response. */
export interface ReferencePayload {
  readonly generatedAt: number
  readonly routes: readonly Route[]
  readonly drivers: readonly Driver[]
  readonly customers: readonly Customer[]
  readonly traffic: readonly TrafficCondition[]
  readonly vehicleCount: number
  readonly deliveryCount: number
  /**
   * Where the server's reference sequences have reached. The engine continues
   * from here, so a delivery dispatched during the session gets the next
   * reference in the series rather than restarting at one.
   */
  readonly counters: ReferenceCounters
}

/** The operational overlay: incidents, alerts and the activity backlog. */
export interface OperationsPayload {
  readonly incidents: readonly Incident[]
  readonly alerts: readonly Alert[]
  readonly activity: readonly ActivityEvent[]
}

export interface VehiclePageItem {
  readonly vehicle: Vehicle
  readonly kinematics: VehicleKinematics
}

export class MockApiError extends Error {
  readonly status: number

  constructor(message: string, status = 503) {
    super(message)
    this.name = "MockApiError"
    this.status = status
  }
}

export const DEFAULT_PAGE_SIZE = 120

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const handle = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(handle)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true }
    )
  })
}

/**
 * The "server side" dataset.
 *
 * Generated once per (seed, now) and held so every page of every collection is
 * served from the same world. Regenerating per request would be both wasteful
 * and wrong — page two would describe a different universe from page one.
 */
let cached: { key: string; data: BootstrapData } | null = null

function datasetFor(options: MockApiOptions): BootstrapData {
  const seed = options.seed
  const now = options.now
  const key = `${seed ?? "default"}:${now ?? "session"}`

  if (cached?.key === key) {
    return cached.data
  }

  const seedOption = seed === undefined ? {} : { seed }
  const nowOption = now === undefined ? {} : { now }
  const data = generateBootstrapData({ ...seedOption, ...nowOption })

  cached = { key, data }
  return data
}

/** Clears the server-side cache. Used when resetting between tests. */
export function resetMockApi(): void {
  cached = null
}

function paginate<T>(
  items: readonly T[],
  request: PageRequest
): Page<T> {
  const cursor = Math.max(0, request.cursor ?? 0)
  const limit = Math.max(1, request.limit ?? DEFAULT_PAGE_SIZE)
  const slice = items.slice(cursor, cursor + limit)
  const next = cursor + slice.length

  return {
    items: slice,
    nextCursor: next >= items.length ? null : next,
    total: items.length,
  }
}

async function respond<T>(
  value: () => T,
  options: MockApiOptions,
  signal: AbortSignal | undefined,
  latencyScale = 1
): Promise<T> {
  const { latencyMs = 220, failureRate = 0 } = options

  await delay(latencyMs * latencyScale, signal)

  if (failureRate > 0 && Math.random() < failureRate) {
    throw new MockApiError("Operations gateway did not respond in time")
  }

  return value()
}

export const operationsApi = {
  /**
   * The reference payload also carries the collection totals, so the client
   * can show real progress instead of an indeterminate bar.
   */
  async fetchReference(
    options: MockApiOptions = {},
    signal?: AbortSignal
  ): Promise<ReferencePayload> {
    return respond(
      () => {
        const { snapshot, counters } = datasetFor(options)
        return {
          generatedAt: snapshot.generatedAt,
          routes: snapshot.routes,
          drivers: snapshot.drivers,
          customers: snapshot.customers,
          traffic: snapshot.traffic,
          vehicleCount: snapshot.vehicles.length,
          deliveryCount: snapshot.deliveries.length,
          counters: { ...counters },
        }
      },
      options,
      signal
    )
  },

  /** Vehicles arrive with the kinematic state the engine needs to drive them. */
  async fetchVehiclePage(
    request: PageRequest = {},
    options: MockApiOptions = {},
    signal?: AbortSignal
  ): Promise<Page<VehiclePageItem>> {
    return respond(
      () => {
        const { snapshot, kinematics } = datasetFor(options)
        const byVehicleId = new Map(
          kinematics.map((entry) => [entry.vehicleId, entry])
        )
        const items = snapshot.vehicles.map((vehicle) => ({
          vehicle,
          kinematics: byVehicleId.get(vehicle.id) as VehicleKinematics,
        }))
        return paginate(items, request)
      },
      options,
      signal,
      // Pages are cheaper than the initial handshake.
      0.3
    )
  },

  async fetchDeliveryPage(
    request: PageRequest = {},
    options: MockApiOptions = {},
    signal?: AbortSignal
  ): Promise<Page<Delivery>> {
    return respond(
      () => paginate(datasetFor(options).snapshot.deliveries, request),
      options,
      signal,
      0.3
    )
  },

  async fetchOperations(
    options: MockApiOptions = {},
    signal?: AbortSignal
  ): Promise<OperationsPayload> {
    return respond(
      () => {
        const { snapshot } = datasetFor(options)
        return {
          incidents: snapshot.incidents,
          alerts: snapshot.alerts,
          activity: snapshot.activity,
        }
      },
      options,
      signal,
      0.5
    )
  },

  /** The generation options, needed so a reset reproduces the same world. */
  generationOptions(options: MockApiOptions = {}): BootstrapData["options"] {
    return datasetFor(options).options
  },
}

export type { BootstrapData }
