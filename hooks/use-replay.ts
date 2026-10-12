"use client"

import { useCallback, useMemo } from "react"
import { simulationEngine } from "@/services/simulation"
import {
  createRecorder,
  operationsRecorder,
  type Keyframe,
} from "@/services/simulation/recorder"
import { operationsNow } from "@/services/simulation/ops-clock"
import { useDeliveryStore, useVehicleStore } from "@/stores"
import { useReplayStore } from "@/stores/replay-store"
import { notify } from "@/stores/toast-store"
import type { Delivery, Vehicle } from "@/types"

export interface UseReplayResult {
  readonly frames: readonly Keyframe[]
  /** Index into `frames` while reviewing, otherwise null. */
  readonly index: number | null
  readonly reviewing: boolean
  readonly current: Keyframe | null
  /** How far back the current frame is, in simulated minutes. */
  readonly minutesBack: number
  enter(): void
  scrubTo(index: number): void
  exit(): void
}

/** Where the live state is parked while the operator looks backwards. */
const liveRecorder = createRecorder(1)

/** Turns a keyframe into store patches and applies it. */
function applyFrame(frame: Keyframe, now: number): void {
  useVehicleStore.getState().applyPatches(
    frame.vehicles.map((entry) => ({
      id: entry.id,
      changes: {
        status: entry.status,
        location: { lat: entry.lat, lng: entry.lng },
        heading: entry.heading,
        speed: entry.speed,
        fuelLevel: entry.fuelLevel,
        routeId: entry.routeId,
        deliveryId: entry.deliveryId,
      },
    }))
  )

  useDeliveryStore.getState().applyPatches(
    frame.deliveries.map((entry) => ({
      id: entry.id,
      changes: {
        status: entry.status,
        etaAt: entry.etaAt,
        delayMinutes: entry.delayMinutes,
        remainingKm: entry.remainingKm,
        progressFraction: entry.progressFraction,
        completedAt: entry.completedAt,
        vehicleId: entry.vehicleId,
      },
    })),
    now
  )
}

function readVehicles(): readonly Vehicle[] {
  const { byId, ids } = useVehicleStore.getState()
  return ids
    .map((id) => byId[id])
    .filter((vehicle): vehicle is Vehicle => vehicle !== undefined)
}

function readDeliveries(): readonly Delivery[] {
  const { byId, ids } = useDeliveryStore.getState()
  return ids
    .map((id) => byId[id])
    .filter((delivery): delivery is Delivery => delivery !== undefined)
}

/**
 * Review mode.
 *
 * Entering it pauses the simulation first, which is what makes restoring a past
 * frame safe: with the engine stopped nothing is emitting, so the stores can be
 * rewritten without racing the live stream. Leaving it puts the live state back
 * exactly as it was found and resumes if it had been running.
 *
 * The console is explicitly read-only while reviewing. Letting an operator
 * cancel a delivery against a ten-minute-old board would apply the command to
 * the present using a decision made about the past, which is the one thing a
 * review feature must not allow.
 */
export function useReplay(): UseReplayResult {
  const index = useReplayStore((state) => state.index)
  const wasRunning = useReplayStore((state) => state.wasRunning)
  const version = useReplayStore((state) => state.version)
  const begin = useReplayStore((state) => state.begin)
  const setIndex = useReplayStore((state) => state.setIndex)
  const end = useReplayStore((state) => state.end)

  // The recorder is not a store, so nothing re-renders when a frame lands.
  // Reading it through a version counter bumped on entry is enough: the list
  // only has to be current at the moment review begins.
  const frames = useMemo(() => {
    void version
    return operationsRecorder.frames()
  }, [version])

  const enter = useCallback((): void => {
    const available = operationsRecorder.frames()
    if (available.length === 0) {
      notify({
        tone: "info",
        message: "Nothing recorded yet",
        detail: "The first snapshot is taken a few seconds after the shift starts.",
      })
      return
    }

    const running = simulationEngine.getStatus().running
    if (running) {
      simulationEngine.pause()
    }

    liveRecorder.clear()
    liveRecorder.capture(operationsNow(), readVehicles(), readDeliveries())

    const last = available.length - 1
    begin(last, running)
    const frame = available[last]
    if (frame) {
      applyFrame(frame, operationsNow())
    }
  }, [begin])

  const scrubTo = useCallback(
    (next: number): void => {
      if (index === null) {
        return
      }
      const clamped = Math.min(frames.length - 1, Math.max(0, next))
      const frame = frames[clamped]
      if (!frame) {
        return
      }
      setIndex(clamped)
      applyFrame(frame, operationsNow())
    },
    [index, frames, setIndex]
  )

  const exit = useCallback((): void => {
    const [live] = liveRecorder.frames()
    if (live) {
      applyFrame(live, operationsNow())
    }
    liveRecorder.clear()
    end()

    if (wasRunning) {
      simulationEngine.start()
    }
  }, [wasRunning, end])

  const current = index === null ? null : (frames[index] ?? null)

  return {
    frames,
    index,
    reviewing: index !== null,
    current,
    minutesBack:
      current === null ? 0 : Math.max(0, (operationsNow() - current.at) / 60_000),
    enter,
    scrubTo,
    exit,
  }
}
