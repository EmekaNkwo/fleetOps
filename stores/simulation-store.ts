import { create } from "zustand"
import { RATE_INTERVALS } from "@/data/config"
import { preferences } from "@/services/storage/preferences"
import { simulationEngine } from "@/services/simulation"
import type {
  EventRate,
  SimulationConfig,
  SimulationEventKind,
  SimulationStatus,
  SimulationToggles,
} from "@/types"

export type BootstrapPhase = "idle" | "loading" | "ready" | "error"

interface SimulationState {
  readonly phase: BootstrapPhase
  readonly error: string | null
  readonly status: SimulationStatus
  readonly config: SimulationConfig
  /** Counts handler failures so the UI can surface a degraded-mode banner. */
  readonly processingErrors: number
  readonly lastErrorMessage: string | null

  setPhase(phase: BootstrapPhase, error?: string | null): void
  syncStatus(status: SimulationStatus): void
  recordProcessingError(message: string): void

  start(): void
  pause(): void
  toggle(): void
  reset(): void
  setRate(rate: EventRate): void
  setToggle(key: keyof SimulationToggles, value: boolean): void
  injectScenario(kind: SimulationEventKind): boolean
}

const IDLE_STATUS: SimulationStatus = {
  running: false,
  tick: 0,
  startedAt: null,
  eventsEmitted: 0,
  lastEventAt: null,
}

/**
 * Thin, UI-facing façade over the engine.
 *
 * The store holds no simulation logic of its own: it mirrors the engine's
 * status for rendering and forwards intent. That keeps the engine the single
 * writer of world state while giving components a plain action surface.
 */
export const useSimulationStore = create<SimulationState>()((set, get) => ({
  phase: "idle",
  error: null,
  status: IDLE_STATUS,
  config: preferences.loadSimulation(),
  processingErrors: 0,
  lastErrorMessage: null,

  setPhase: (phase, error = null) => {
    set({ phase, error })
  },

  syncStatus: (status) => {
    set({ status })
  },

  recordProcessingError: (message) => {
    set((state) => ({
      processingErrors: state.processingErrors + 1,
      lastErrorMessage: message,
    }))
  },

  start: () => {
    simulationEngine.start()
    set({ status: simulationEngine.getStatus() })
  },

  pause: () => {
    simulationEngine.pause()
    set({ status: simulationEngine.getStatus() })
  },

  toggle: () => {
    const { status } = get()
    if (status.running) {
      get().pause()
      return
    }
    get().start()
  },

  reset: () => {
    simulationEngine.reset()
    set({ status: simulationEngine.getStatus() })
  },

  setRate: (rate) => {
    const config: SimulationConfig = { ...get().config, rate }
    simulationEngine.setRate(rate)
    preferences.saveSimulation(config)
    set({ config })
  },

  setToggle: (key, value) => {
    const current = get().config
    const config: SimulationConfig = {
      ...current,
      toggles: { ...current.toggles, [key]: value },
    }
    simulationEngine.setToggles(config.toggles)
    preferences.saveSimulation(config)
    set({ config })
  },

  injectScenario: (kind) => simulationEngine.injectScenario(kind),
}))
