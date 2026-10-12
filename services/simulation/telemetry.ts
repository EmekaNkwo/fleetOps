import { MOVEMENT_INTERVAL_MS } from "@/data/config"
import type { Location, VehicleStatus } from "@/types"

/**
 * A single vehicle's render state, holding both the previous and the current
 * fix so the map can interpolate between integration ticks.
 */
export interface TelemetrySample {
  readonly vehicleId: string
  readonly callSign: string
  status: VehicleStatus
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  fromHeading: number
  toHeading: number
  speed: number
  routeId: string | null
  deliveryId: string | null
  /** `performance.now()` of the last write — the interpolation anchor. */
  stampedAt: number
}

/**
 * Out-of-band position store for the live map.
 *
 * The map draws 500 vehicles at display refresh rate. Routing those positions
 * through React state would mean 500 reconciliations per second, so the
 * simulation writes here instead and the canvas layer reads it inside its own
 * `requestAnimationFrame` loop. No component re-renders when a truck moves —
 * only when something a human needs to read about it changes.
 */
export interface TelemetryBuffer {
  write(input: {
    readonly vehicleId: string
    readonly callSign: string
    readonly status: VehicleStatus
    readonly location: Location
    readonly heading: number
    readonly speed: number
    readonly routeId: string | null
    readonly deliveryId: string | null
  }): void
  /** Status-only update, used when a vehicle changes state without moving. */
  patchStatus(vehicleId: string, status: VehicleStatus): void
  remove(vehicleId: string): void
  get(vehicleId: string): TelemetrySample | undefined
  /** Live view of every sample. Callers must not mutate the returned map. */
  samples(): ReadonlyMap<string, TelemetrySample>
  /**
   * Bumped on every write. The renderer uses it to decide whether a frame
   * would differ from the last one at all.
   */
  version(): number
  /** `performance.now()` of the most recent write. */
  lastWriteAt(): number
  /** Interpolated position for the current frame. */
  interpolate(sample: TelemetrySample, nowReal: number): {
    readonly lat: number
    readonly lng: number
    readonly heading: number
  }
  size(): number
  clear(): void
}

function shortestHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return (from + delta * t + 360) % 360
}

export function createTelemetryBuffer(
  intervalMs: number = MOVEMENT_INTERVAL_MS
): TelemetryBuffer {
  const store = new Map<string, TelemetrySample>()
  let version = 0
  let lastWriteAt = 0
  const clock = (): number =>
    typeof performance === "undefined" ? Date.now() : performance.now()

  return {
    write(input) {
      const existing = store.get(input.vehicleId)
      const stampedAt = clock()
      version += 1
      lastWriteAt = stampedAt

      if (!existing) {
        store.set(input.vehicleId, {
          vehicleId: input.vehicleId,
          callSign: input.callSign,
          status: input.status,
          fromLat: input.location.lat,
          fromLng: input.location.lng,
          toLat: input.location.lat,
          toLng: input.location.lng,
          fromHeading: input.heading,
          toHeading: input.heading,
          speed: input.speed,
          routeId: input.routeId,
          deliveryId: input.deliveryId,
          stampedAt,
        })
        return
      }

      // Mutating in place is deliberate here: this buffer is private to the
      // render loop, is never read by React, and allocating 500 objects per
      // tick is exactly the pressure this layer exists to avoid.
      existing.fromLat = existing.toLat
      existing.fromLng = existing.toLng
      existing.fromHeading = existing.toHeading
      existing.toLat = input.location.lat
      existing.toLng = input.location.lng
      existing.toHeading = input.heading
      existing.speed = input.speed
      existing.status = input.status
      existing.routeId = input.routeId
      existing.deliveryId = input.deliveryId
      existing.stampedAt = stampedAt
    },

    patchStatus(vehicleId, status) {
      const existing = store.get(vehicleId)
      if (existing && existing.status !== status) {
        existing.status = status
        version += 1
      }
    },

    remove(vehicleId) {
      store.delete(vehicleId)
    },

    get: (vehicleId) => store.get(vehicleId),

    samples: () => store,

    version: () => version,

    lastWriteAt: () => lastWriteAt,

    interpolate(sample, nowReal) {
      const elapsed = nowReal - sample.stampedAt
      const t = intervalMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / intervalMs))
      return {
        lat: sample.fromLat + (sample.toLat - sample.fromLat) * t,
        lng: sample.fromLng + (sample.toLng - sample.fromLng) * t,
        heading: shortestHeading(sample.fromHeading, sample.toHeading, t),
      }
    },

    size: () => store.size,

    clear() {
      store.clear()
      version += 1
    },
  }
}

/** Shared buffer used by the running application. */
export const telemetryBuffer: TelemetryBuffer = createTelemetryBuffer()
