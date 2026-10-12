import { describe, expect, it } from "vitest"
import { THRESHOLDS } from "@/data/config"
import { HOUR_MS, MINUTE_MS } from "@/lib/clock"
import {
  computePerformance,
  countDeliveries,
  countFleet,
  deriveDeliveryStatus,
  deriveVehicleStatus,
  effectiveSpeed,
  etaFromRemaining,
  fleetAvailability,
  fleetUtilisation,
  headroomMinutes,
  isEtaAccurate,
  slippageMinutes,
  trafficFactor,
} from "@/lib/calculations"
import type { Delivery, Vehicle } from "@/types"

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: "del-1",
    reference: "DEL-1",
    status: "IN_TRANSIT",
    priority: "STANDARD",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    driverId: "driver-1",
    routeId: "lag-iba",
    originRegion: "lagos",
    destinationRegion: "ibadan",
    weightKg: 1_000,
    createdAt: NOW - HOUR_MS,
    startedAt: NOW - HOUR_MS,
    completedAt: null,
    promisedAt: NOW + 2 * HOUR_MS,
    etaAt: NOW + HOUR_MS,
    originalEtaAt: NOW + HOUR_MS,
    delayMinutes: 0,
    progressFraction: 0.5,
    remainingKm: 60,
    timeline: [],
    ...overrides,
  }
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "vehicle-1",
    callSign: "101",
    type: "Toyota Hiace",
    plateNumber: "LAG-123-AB",
    driverId: "driver-1",
    status: "ON_ROUTE",
    location: { lat: 6.5, lng: 3.4 },
    speed: 60,
    heading: 90,
    routeId: "lag-iba",
    deliveryId: "del-1",
    homeRegion: "lagos",
    fuelLevel: 70,
    mileageKm: 100_000,
    lastMaintenance: NOW,
    capacityKg: 1_000,
    lastSeen: NOW,
    ...overrides,
  }
}

describe("speed and ETA", () => {
  it("slows a vehicle in proportion to the traffic level", () => {
    const free = effectiveSpeed(80, "normal", 0)
    const slow = effectiveSpeed(80, "slow", 0)
    const congested = effectiveSpeed(80, "congested", 0)

    expect(free).toBe(80)
    expect(slow).toBeLessThan(free)
    expect(congested).toBeLessThan(slow)
    expect(trafficFactor("congested")).toBeLessThan(trafficFactor("slow"))
  })

  it("never reports a vehicle as fully stopped from traffic alone", () => {
    expect(effectiveSpeed(10, "congested", -0.12)).toBeGreaterThanOrEqual(6)
  })

  it("pushes the ETA out when speed falls", () => {
    const fast = etaFromRemaining(NOW, 120, 80)
    const slow = etaFromRemaining(NOW, 120, 40)

    expect(slow).toBeGreaterThan(fast)
    expect(fast - NOW).toBeCloseTo(1.5 * HOUR_MS, -2)
  })
})

describe("delivery status derivation", () => {
  it("stays in transit while there is comfortable headroom", () => {
    const status = deriveDeliveryStatus({
      current: "IN_TRANSIT",
      etaAt: NOW,
      promisedAt: NOW + 2 * HOUR_MS,
    })

    expect(status).toBe("IN_TRANSIT")
  })

  it("becomes at risk once headroom falls below the threshold", () => {
    const status = deriveDeliveryStatus({
      current: "IN_TRANSIT",
      etaAt: NOW,
      promisedAt: NOW + (THRESHOLDS.atRiskMinutes - 5) * MINUTE_MS,
    })

    expect(status).toBe("AT_RISK")
  })

  it("becomes delayed once slippage passes the threshold", () => {
    const status = deriveDeliveryStatus({
      current: "AT_RISK",
      etaAt: NOW + (THRESHOLDS.delayedMinutes + 5) * MINUTE_MS,
      promisedAt: NOW,
    })

    expect(status).toBe("DELAYED")
  })

  it("recovers to in transit when the ETA improves again", () => {
    const status = deriveDeliveryStatus({
      current: "DELAYED",
      etaAt: NOW,
      promisedAt: NOW + 3 * HOUR_MS,
    })

    expect(status).toBe("IN_TRANSIT")
  })

  it("treats completed and cancelled as terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      expect(
        deriveDeliveryStatus({
          current: terminal,
          etaAt: NOW + 10 * HOUR_MS,
          promisedAt: NOW,
        })
      ).toBe(terminal)
    }
  })

  it("measures slippage and headroom as mirror images", () => {
    expect(slippageMinutes(NOW + 30 * MINUTE_MS, NOW)).toBeCloseTo(30)
    expect(slippageMinutes(NOW, NOW + 30 * MINUTE_MS)).toBe(0)
    expect(headroomMinutes(NOW, NOW + 30 * MINUTE_MS)).toBeCloseTo(30)
  })
})

describe("vehicle status derivation", () => {
  it("keeps connectivity above everything else", () => {
    expect(
      deriveVehicleStatus({ current: "OFFLINE", deliveryStatus: "IN_TRANSIT" })
    ).toBe("OFFLINE")
  })

  it("mirrors the delivery it is carrying", () => {
    expect(
      deriveVehicleStatus({ current: "ON_ROUTE", deliveryStatus: "DELAYED" })
    ).toBe("DELAYED")
    expect(
      deriveVehicleStatus({ current: "ON_ROUTE", deliveryStatus: "AT_RISK" })
    ).toBe("AT_RISK")
    expect(
      deriveVehicleStatus({ current: "ON_ROUTE", deliveryStatus: "COMPLETED" })
    ).toBe("DELIVERED")
  })

  it("is idle with no delivery, or with one not yet departed", () => {
    expect(
      deriveVehicleStatus({ current: "ON_ROUTE", deliveryStatus: null })
    ).toBe("IDLE")
    expect(
      deriveVehicleStatus({ current: "ON_ROUTE", deliveryStatus: "ASSIGNED" })
    ).toBe("IDLE")
  })
})

describe("aggregates", () => {
  it("counts the fleet by status and separates online from offline", () => {
    const counts = countFleet([
      vehicle({ id: "a", status: "ON_ROUTE" }),
      vehicle({ id: "b", status: "ON_ROUTE" }),
      vehicle({ id: "c", status: "DELAYED" }),
      vehicle({ id: "d", status: "AT_RISK" }),
      vehicle({ id: "e", status: "IDLE" }),
      vehicle({ id: "f", status: "OFFLINE" }),
    ])

    expect(counts).toMatchObject({
      total: 6,
      online: 5,
      offline: 1,
      onRoute: 2,
      delayed: 1,
      atRisk: 1,
      idle: 1,
    })
  })

  it("counts only today's completions as delivered today", () => {
    const dayStart = NOW - 9 * HOUR_MS
    const counts = countDeliveries(
      [
        delivery({ id: "a", status: "COMPLETED", completedAt: NOW - HOUR_MS }),
        delivery({
          id: "b",
          status: "COMPLETED",
          completedAt: dayStart - HOUR_MS,
        }),
        delivery({ id: "c", status: "IN_TRANSIT" }),
      ],
      dayStart
    )

    expect(counts.completedToday).toBe(1)
    expect(counts.inTransit).toBe(1)
    expect(counts.total).toBe(3)
  })

  it("reports utilisation as the share of the fleet actually working", () => {
    const counts = countFleet([
      vehicle({ id: "a", status: "ON_ROUTE" }),
      vehicle({ id: "b", status: "DELAYED" }),
      vehicle({ id: "c", status: "IDLE" }),
      vehicle({ id: "d", status: "OFFLINE" }),
    ])

    expect(fleetUtilisation(counts)).toBeCloseTo(0.5)
    expect(fleetAvailability(counts)).toBeCloseTo(0.75)
  })

  it("derives on-time rate from closed deliveries only", () => {
    const performance = computePerformance(
      [
        delivery({
          id: "a",
          status: "COMPLETED",
          completedAt: NOW - HOUR_MS,
          promisedAt: NOW,
          startedAt: NOW - 2 * HOUR_MS,
        }),
        delivery({
          id: "b",
          status: "COMPLETED",
          completedAt: NOW,
          promisedAt: NOW - HOUR_MS,
          startedAt: NOW - 3 * HOUR_MS,
        }),
        delivery({ id: "c", status: "IN_TRANSIT" }),
      ],
      NOW
    )

    expect(performance.onTimeRate).toBeCloseTo(0.5)
    // 60 minutes for the first run plus 180 for the second.
    expect(performance.averageDeliveryMinutes).toBeCloseTo(120)
    expect(performance.deliveriesPerHour).toBe(2)
  })

  it("scores ETA accuracy against the dispatch estimate", () => {
    expect(
      isEtaAccurate(delivery({ originalEtaAt: NOW, etaAt: NOW + 5 * MINUTE_MS }))
    ).toBe(true)
    expect(
      isEtaAccurate(delivery({ originalEtaAt: NOW, etaAt: NOW + 90 * MINUTE_MS }))
    ).toBe(false)
  })
})
