"use client"

import { useCallback, useEffect } from "react"
import { RATE_LABELS } from "@/data/config"
import { useSimulationStore } from "@/stores"
import type {
  EventRate,
  SimulationEventKind,
  SimulationStatus,
  SimulationToggles,
} from "@/types"

export interface SimulationScenario {
  readonly kind: SimulationEventKind
  readonly label: string
  readonly description: string
}

/** Scenarios an operator can fire by hand, for demos and for testing. */
const SCENARIOS: readonly SimulationScenario[] = [
  {
    kind: "traffic",
    label: "Trigger traffic spike",
    description: "Degrades a corridor and pushes every ETA on it",
  },
  {
    kind: "delay",
    label: "Stop a vehicle",
    description: "Halts a truck until it is released",
  },
  {
    kind: "vehicle_failure",
    label: "Take a vehicle offline",
    description: "Drops telemetry and opens an incident",
  },
  {
    kind: "new_delivery",
    label: "Dispatch a new delivery",
    description: "Assigns the nearest idle vehicle",
  },
  {
    kind: "delivery_completion",
    label: "Complete a delivery",
    description: "Closes out the delivery nearest its destination",
  },
  {
    kind: "recovery",
    label: "Run a recovery step",
    description: "Clears congestion or reconnects a vehicle",
  },
]

export interface UseSimulationResult {
  readonly status: SimulationStatus
  readonly running: boolean
  readonly rate: EventRate
  readonly rateLabel: string
  readonly toggles: SimulationToggles
  readonly scenarios: readonly SimulationScenario[]
  readonly processingErrors: number
  readonly lastErrorMessage: string | null
  start(): void
  pause(): void
  toggle(): void
  reset(): void
  setRate(rate: EventRate): void
  setToggle(key: keyof SimulationToggles, value: boolean): void
  injectScenario(kind: SimulationEventKind): boolean
}

/**
 * Simulation control surface. Components get booleans and callbacks; the engine
 * itself stays behind the store.
 *
 * The simulation is also paused while the tab is hidden: a backgrounded tab
 * throttles timers, and resuming would otherwise replay a large accumulated
 * delta in one step and teleport the fleet.
 */
export function useSimulation(): UseSimulationResult {
  const status = useSimulationStore((state) => state.status)
  const config = useSimulationStore((state) => state.config)
  const processingErrors = useSimulationStore((state) => state.processingErrors)
  const lastErrorMessage = useSimulationStore((state) => state.lastErrorMessage)
  const start = useSimulationStore((state) => state.start)
  const pause = useSimulationStore((state) => state.pause)
  const toggle = useSimulationStore((state) => state.toggle)
  const reset = useSimulationStore((state) => state.reset)
  const setRate = useSimulationStore((state) => state.setRate)
  const setToggle = useSimulationStore((state) => state.setToggle)
  const injectScenario = useSimulationStore((state) => state.injectScenario)

  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden" && status.running) {
        pause()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [pause, status.running])

  const inject = useCallback(
    (kind: SimulationEventKind): boolean => injectScenario(kind),
    [injectScenario]
  )

  return {
    status,
    running: status.running,
    rate: config.rate,
    rateLabel: RATE_LABELS[config.rate],
    toggles: config.toggles,
    scenarios: SCENARIOS,
    processingErrors,
    lastErrorMessage,
    start,
    pause,
    toggle,
    reset,
    setRate,
    setToggle,
    injectScenario: inject,
  }
}
