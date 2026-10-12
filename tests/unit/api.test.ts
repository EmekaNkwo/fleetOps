import { beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_PAGE_SIZE,
  MockApiError,
  operationsApi,
  resetMockApi,
} from "@/services/mock/api"
import type { Delivery } from "@/types"

const OPTIONS = { seed: 555, now: Date.UTC(2026, 0, 15, 9, 0, 0), latencyMs: 0 }

/** Walks a cursor-paginated endpoint to exhaustion. */
async function drain<T>(
  fetchPage: (cursor: number) => Promise<{
    items: readonly T[]
    nextCursor: number | null
    total: number
  }>
): Promise<{ items: T[]; pages: number; total: number }> {
  const items: T[] = []
  let cursor: number | null = 0
  let pages = 0
  let total = 0

  while (cursor !== null) {
    const page = await fetchPage(cursor)
    items.push(...page.items)
    total = page.total
    cursor = page.nextCursor
    pages += 1

    if (pages > 100) {
      throw new Error("pagination did not terminate")
    }
  }

  return { items, pages, total }
}

beforeEach(() => {
  resetMockApi()
})

describe("reference payload", () => {
  it("carries the collection totals so progress can be a real fraction", async () => {
    const reference = await operationsApi.fetchReference(OPTIONS)

    expect(reference.routes.length).toBeGreaterThan(0)
    expect(reference.drivers.length).toBeGreaterThan(0)
    expect(reference.vehicleCount).toBeGreaterThan(0)
    expect(reference.deliveryCount).toBeGreaterThan(0)
  })

  it("reports where the id sequences have reached", async () => {
    const reference = await operationsApi.fetchReference(OPTIONS)

    // New deliveries must continue the series, not restart it.
    expect(reference.counters.delivery).toBeGreaterThan(28_000)
  })
})

describe("pagination", () => {
  it("pages vehicles to exhaustion without gaps or repeats", async () => {
    const reference = await operationsApi.fetchReference(OPTIONS)
    const { items, pages, total } = await drain((cursor) =>
      operationsApi.fetchVehiclePage({ cursor, limit: 50 }, OPTIONS)
    )

    expect(total).toBe(reference.vehicleCount)
    expect(items).toHaveLength(reference.vehicleCount)
    expect(pages).toBeGreaterThan(1)

    const ids = new Set(items.map((item) => item.vehicle.id))
    expect(ids.size).toBe(items.length)
  })

  it("pairs every vehicle with its kinematic state", async () => {
    const { items } = await drain((cursor) =>
      operationsApi.fetchVehiclePage({ cursor, limit: 200 }, OPTIONS)
    )

    for (const item of items) {
      expect(item.kinematics.vehicleId).toBe(item.vehicle.id)
    }
  })

  it("pages deliveries to exhaustion", async () => {
    const reference = await operationsApi.fetchReference(OPTIONS)
    const { items, total } = await drain<Delivery>((cursor) =>
      operationsApi.fetchDeliveryPage({ cursor, limit: 100 }, OPTIONS)
    )

    expect(total).toBe(reference.deliveryCount)
    expect(items).toHaveLength(reference.deliveryCount)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
  })

  it("serves every page from the same generated world", async () => {
    const first = await operationsApi.fetchDeliveryPage(
      { cursor: 0, limit: 10 },
      OPTIONS
    )
    const again = await operationsApi.fetchDeliveryPage(
      { cursor: 0, limit: 10 },
      OPTIONS
    )

    // Page one must not describe a different universe on a second request.
    expect(again.items).toEqual(first.items)
  })

  it("closes the cursor exactly at the end of the collection", async () => {
    const reference = await operationsApi.fetchReference(OPTIONS)
    const limit = reference.deliveryCount
    const page = await operationsApi.fetchDeliveryPage({ cursor: 0, limit }, OPTIONS)

    expect(page.items).toHaveLength(limit)
    expect(page.nextCursor).toBeNull()
  })

  it("returns an empty final page for a cursor past the end", async () => {
    const page = await operationsApi.fetchDeliveryPage(
      { cursor: 1_000_000, limit: 10 },
      OPTIONS
    )

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  it("defaults to a sensible page size", async () => {
    const page = await operationsApi.fetchVehiclePage({}, OPTIONS)
    expect(page.items.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE)
  })
})

describe("failure handling", () => {
  it("surfaces a typed gateway error", async () => {
    await expect(
      operationsApi.fetchReference({ ...OPTIONS, failureRate: 1 })
    ).rejects.toBeInstanceOf(MockApiError)
  })

  it("aborts an in-flight request", async () => {
    const controller = new AbortController()
    const pending = operationsApi.fetchReference(
      { ...OPTIONS, latencyMs: 500 },
      controller.signal
    )
    controller.abort()

    await expect(pending).rejects.toThrow()
  })
})

describe("operational overlay", () => {
  it("returns incidents, alerts and the activity backlog together", async () => {
    const operations = await operationsApi.fetchOperations(OPTIONS)

    expect(operations.incidents.length).toBeGreaterThan(0)
    expect(operations.alerts.length).toBeGreaterThan(0)
    expect(operations.activity.length).toBeGreaterThan(0)
  })
})
