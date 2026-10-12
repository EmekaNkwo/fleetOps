import { formatClock } from "@/lib/formatting"
import type { Delivery, DeliveryStatus, Vehicle, VehicleStatus } from "@/types"

/**
 * Only the fields that move.
 *
 * A keyframe stores what the simulation changes, not whole records. A vehicle's
 * plate, type, capacity and driver are fixed for the life of the world, so
 * copying them twenty-four times would multiply the memory cost for no
 * information — the live record supplies them on restore.
 */
export interface VehicleFrame {
  readonly id: string
  readonly status: VehicleStatus
  readonly lat: number
  readonly lng: number
  readonly heading: number
  readonly speed: number
  readonly fuelLevel: number
  readonly routeId: string | null
  readonly deliveryId: string | null
}

export interface DeliveryFrame {
  readonly id: string
  readonly status: DeliveryStatus
  readonly etaAt: number
  readonly delayMinutes: number
  readonly remainingKm: number
  readonly progressFraction: number
  readonly completedAt: number | null
  readonly vehicleId: string | null
}

export interface Keyframe {
  readonly at: number
  readonly label: string
  readonly vehicles: readonly VehicleFrame[]
  readonly deliveries: readonly DeliveryFrame[]
}

/**
 * How many keyframes are kept.
 *
 * At one frame per metrics sample this is four minutes of wall clock, which at
 * the ×90 operations clock is about six hours of fleet time — comfortably more
 * than the window an operator would want to look back over, and bounded enough
 * that the buffer cannot grow into a leak over an all-day session.
 */
export const MAX_KEYFRAMES = 24

export interface Recorder {
  capture(
    at: number,
    vehicles: readonly Vehicle[],
    deliveries: readonly Delivery[]
  ): void
  frames(): readonly Keyframe[]
  clear(): void
}

/**
 * The replay buffer.
 *
 * Keyframes only — no event log between them. Replaying a deterministic
 * simulation by re-running it from a seed would be the textbook approach and
 * is the wrong one here: the operator has been changing the world all shift
 * (cancelling, reassigning, re-grading), so a re-run from the seed reproduces a
 * shift that did not happen. Snapshots record what was actually on screen,
 * which is what "what did it look like ten minutes ago" means.
 *
 * The cost of that choice is honest and worth stating: review jumps between
 * captured moments rather than scrubbing continuously, and it restores fleet
 * and delivery state rather than every panel in the console.
 */
export function createRecorder(limit = MAX_KEYFRAMES): Recorder {
  let buffer: Keyframe[] = []

  return {
    capture(at, vehicles, deliveries) {
      const frame: Keyframe = {
        at,
        label: formatClock(at),
        vehicles: vehicles.map((vehicle) => ({
          id: vehicle.id,
          status: vehicle.status,
          lat: vehicle.location.lat,
          lng: vehicle.location.lng,
          heading: vehicle.heading,
          speed: vehicle.speed,
          fuelLevel: vehicle.fuelLevel,
          routeId: vehicle.routeId,
          deliveryId: vehicle.deliveryId,
        })),
        deliveries: deliveries.map((delivery) => ({
          id: delivery.id,
          status: delivery.status,
          etaAt: delivery.etaAt,
          delayMinutes: delivery.delayMinutes,
          remainingKm: delivery.remainingKm,
          progressFraction: delivery.progressFraction,
          completedAt: delivery.completedAt,
          vehicleId: delivery.vehicleId,
        })),
      }

      buffer.push(frame)
      if (buffer.length > limit) {
        buffer = buffer.slice(buffer.length - limit)
      }
    },

    frames: () => buffer,

    clear() {
      buffer = []
    },
  }
}

/** The single buffer the console records into. */
export const operationsRecorder = createRecorder()
