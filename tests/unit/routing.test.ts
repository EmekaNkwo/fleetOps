import { describe, expect, it } from "vitest"
import { bearingDegrees, haversineKm, interpolate, approachHeading } from "@/lib/geo"
import { buildRoutes, resolveProgress, routePolyline } from "@/lib/routing"
import { createRng } from "@/lib/random"

describe("geo primitives", () => {
  it("measures the Lagos to Ibadan great-circle distance realistically", () => {
    const distance = haversineKm(
      { lat: 6.4541, lng: 3.3947 },
      { lat: 7.3775, lng: 3.947 }
    )

    // Straight-line distance is roughly 119 km; the road is longer.
    expect(distance).toBeGreaterThan(110)
    expect(distance).toBeLessThan(130)
  })

  it("reports a northbound bearing as close to zero degrees", () => {
    expect(bearingDegrees({ lat: 6, lng: 3 }, { lat: 7, lng: 3 })).toBeCloseTo(0)
    expect(bearingDegrees({ lat: 6, lng: 3 }, { lat: 6, lng: 4 })).toBeCloseTo(
      90,
      0
    )
  })

  it("clamps interpolation to the segment", () => {
    const from = { lat: 0, lng: 0 }
    const to = { lat: 10, lng: 10 }

    expect(interpolate(from, to, 0.5)).toEqual({ lat: 5, lng: 5 })
    expect(interpolate(from, to, -1)).toEqual(from)
    expect(interpolate(from, to, 2)).toEqual(to)
  })

  it("turns the short way around the compass", () => {
    // 350° to 10° is a 20° right turn, not a 340° left turn.
    expect(approachHeading(350, 10, 1)).toBeCloseTo(10)
    expect(approachHeading(350, 10, 0.5)).toBeCloseTo(0)
  })
})

describe("route network", () => {
  const routes = buildRoutes()

  it("builds a forward and reverse route for every corridor", () => {
    expect(routes.length).toBeGreaterThan(20)
    expect(routes.length % 2).toBe(0)

    const forward = routes.find((route) => route.id === "lag-iba")
    const reverse = routes.find((route) => route.id === "lag-iba-rev")

    expect(forward?.origin.id).toBe("apapa")
    expect(reverse?.origin.id).toBe("ibadan")
    expect(forward?.totalDistanceKm).toBeCloseTo(
      reverse?.totalDistanceKm ?? 0,
      5
    )
  })

  it("accumulates leg offsets up to the total distance", () => {
    const route = routes.find((entry) => entry.id === "lag-iba")
    if (!route) {
      throw new Error("expected the Lagos–Ibadan route to exist")
    }

    const last = route.legs[route.legs.length - 1]
    expect(last).toBeDefined()
    expect((last?.offsetKm ?? 0) + (last?.distanceKm ?? 0)).toBeCloseTo(
      route.totalDistanceKm,
      5
    )
  })

  it("resolves progress to a position on the corridor", () => {
    const route = routes.find((entry) => entry.id === "lag-iba")
    if (!route) {
      throw new Error("expected the Lagos–Ibadan route to exist")
    }

    const start = resolveProgress(route, 0)
    const middle = resolveProgress(route, route.totalDistanceKm / 2)
    const end = resolveProgress(route, route.totalDistanceKm)

    expect(start.position).toEqual({
      lat: route.origin.lat,
      lng: route.origin.lng,
    })
    expect(start.fraction).toBe(0)
    expect(middle.fraction).toBeCloseTo(0.5, 2)
    expect(end.fraction).toBeCloseTo(1)
    expect(end.remainingKm).toBeCloseTo(0)
    expect(end.position.lat).toBeCloseTo(route.destination.lat, 5)
  })

  it("clamps progress beyond either end of the route", () => {
    const route = routes[0]
    if (!route) {
      throw new Error("expected at least one route")
    }

    expect(resolveProgress(route, -50).travelledKm).toBe(0)
    expect(resolveProgress(route, route.totalDistanceKm * 3).travelledKm).toBe(
      route.totalDistanceKm
    )
  })

  it("exposes a polyline with one more point than legs", () => {
    const route = routes[0]
    if (!route) {
      throw new Error("expected at least one route")
    }

    expect(routePolyline(route)).toHaveLength(route.legs.length + 1)
  })
})

describe("seeded randomness", () => {
  it("reproduces the same sequence for the same seed", () => {
    const first = createRng(42)
    const second = createRng(42)

    const a = Array.from({ length: 20 }, () => first.next())
    const b = Array.from({ length: 20 }, () => second.next())

    expect(a).toEqual(b)
  })

  it("produces a different sequence for a different seed", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  it("keeps integers inside the requested bounds", () => {
    const rng = createRng(7)
    for (let index = 0; index < 500; index += 1) {
      const value = rng.int(3, 9)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(9)
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it("respects weights when picking an index", () => {
    const rng = createRng(11)
    const picks = Array.from({ length: 3_000 }, () => rng.weighted([0, 1, 9]))

    // A zero-weight option must never be selected at all.
    expect(picks.filter((pick) => pick === 0)).toHaveLength(0)
    // The 9:1 option should dominate by roughly that ratio.
    expect(picks.filter((pick) => pick === 2).length).toBeGreaterThan(
      picks.filter((pick) => pick === 1).length * 4
    )
  })

  it("shuffles without losing or duplicating items", () => {
    const rng = createRng(5)
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffle(input)

    expect(shuffled).toHaveLength(input.length)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
