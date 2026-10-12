import { describe, expect, it } from "vitest"
import { haversineKm } from "@/lib/geo"
import { circleRing } from "@/lib/map/geo-circle"
import {
  createProjectionFrame,
  projectX,
  projectY,
  worldScale,
} from "@/lib/map/projection"

/**
 * The canvas overlay projects the fleet itself rather than asking Mapbox, so
 * these are the invariants that keep the two in step. Getting the world size
 * wrong would draw every vehicle in the right pattern at the wrong scale — the
 * fleet would drift off the corridors Mapbox draws underneath it.
 */
describe("mercator projection", () => {
  it("uses Mapbox's 512px world tiles", () => {
    expect(worldScale(0)).toBe(512)
    expect(worldScale(1)).toBe(1_024)
    expect(worldScale(10)).toBe(512 * 1_024)
  })

  it("puts the null island at the centre of the world", () => {
    const frame = createProjectionFrame(0, 0, 0)

    expect(projectX(0, frame)).toBeCloseTo(256)
    expect(projectY(0, frame)).toBeCloseTo(256)
  })

  it("places the antimeridian at the world's edges", () => {
    const frame = createProjectionFrame(0, 0, 0)

    expect(projectX(-180, frame)).toBeCloseTo(0)
    expect(projectX(180, frame)).toBeCloseTo(512)
  })

  it("subtracts the viewport origin", () => {
    const frame = createProjectionFrame(0, 100, 40)

    expect(projectX(0, frame)).toBeCloseTo(156)
    expect(projectY(0, frame)).toBeCloseTo(216)
  })

  it("clamps beyond Mercator's usable latitudes instead of diverging", () => {
    const frame = createProjectionFrame(0, 0, 0)

    expect(Number.isFinite(projectY(90, frame))).toBe(true)
    expect(Number.isFinite(projectY(-90, frame))).toBe(true)
    expect(projectY(90, frame)).toBeCloseTo(projectY(85.0511287798, frame))
  })

  it("keeps north up and east right", () => {
    const frame = createProjectionFrame(7, 0, 0)

    // Screen Y grows downwards, so a higher latitude is a smaller Y.
    expect(projectY(8, frame)).toBeLessThan(projectY(6, frame))
    expect(projectX(4, frame)).toBeLessThan(projectX(6, frame))
  })
})

describe("geofence rings", () => {
  it("returns a closed ring", () => {
    const ring = circleRing({ lat: 6.5, lng: 3.4 }, 20)

    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[64])
  })

  it("sits the requested distance from its centre", () => {
    const centre = { lat: 6.5, lng: 3.4 }
    const ring = circleRing(centre, 25)

    for (const [lng, lat] of ring) {
      const distance = haversineKm(centre, {
        lat: lat as number,
        lng: lng as number,
      })
      // The ring is the equirectangular approximation, not a true geodesic.
      expect(distance).toBeGreaterThan(24.5)
      expect(distance).toBeLessThan(25.5)
    }
  })
})
