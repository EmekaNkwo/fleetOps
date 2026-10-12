import { eventBus } from "@/services/event-bus"
import { createSimulationEngine, type SimulationEngine } from "./engine"
import { telemetryBuffer } from "./telemetry"

/**
 * The application's engine instance. It publishes straight onto the shared
 * event bus; nothing else in the app holds a reference to it except the
 * simulation store, which exposes it to the UI as plain actions.
 *
 * This barrel is deliberately narrow: it is the *application* entry point, not
 * a re-export of the whole subsystem. Tests and internal modules import the
 * specific file they need, which keeps the dependency graph honest about what
 * actually depends on what.
 */
export const simulationEngine: SimulationEngine = createSimulationEngine({
  emit: (name, payload) => {
    eventBus.emit(name, payload)
  },
  telemetry: telemetryBuffer,
})

export { telemetryBuffer }
export type { TelemetryBuffer, TelemetrySample } from "./telemetry"
