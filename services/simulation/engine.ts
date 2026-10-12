import {
  DATASET,
  MOVEMENT_INTERVAL_MS,
  RATE_BURST,
  RATE_INTERVALS,
  DEFAULT_TOGGLES,
} from "@/data/config"
import { createClock } from "@/lib/clock"
import { logger } from "@/lib/logger"
import { createRng } from "@/lib/random"
import {
  generateBootstrapData,
  type BootstrapData,
  type GenerateOptions,
} from "@/services/mock/dataset"
import { DISPATCHERS } from "@/data/people"
import type {
  DeliveryPriority,
  EventRate,
  Geofence,
  IncidentType,
  RegionId,
  Severity,
  OperationsSnapshot,
  SimulationConfig,
  SimulationEventKind,
  SimulationStatus,
  SimulationToggles,
  Vehicle,
} from "@/types"
import type { Emit } from "./emit"
import { generateOperationalEvent, runEventKind } from "./generators"
import { integrateMovement, seedTelemetry } from "./movement"
import {
  assignIncident,
  cancelDelivery,
  clearGeofenceState,
  createIncident,
  evaluateGeofences,
  candidateVehiclesFor,
  completeDelivery,
  dispatchNewDelivery,
  reassignDelivery,
  restoreDelivery,
  setDeliveryPriority,
  transitionAlert,
  transitionIncident,
} from "./operations"
import { setOperationsClock } from "./ops-clock"
import {
  createScheduler,
  realTimers,
  type Scheduler,
  type SchedulerTimers,
} from "./scheduler"
import { telemetryBuffer, type TelemetryBuffer } from "./telemetry"
import { createWorld, type World } from "./world"

const MOVEMENT_TASK = "movement"
const EVENTS_TASK = "events"

/**
 * Commands the UI may issue. They are separate from events on purpose: a
 * command is a request to change the world, an event is a statement that it
 * changed. Routing user actions through the engine keeps it the single writer,
 * so the stores never need to guess at state the engine also owns.
 */
export interface SimulationCommands {
  acknowledgeAlert(alertId: string): void
  dismissAlert(alertId: string): void
  resolveAlert(alertId: string): void
  acknowledgeIncident(incidentId: string, actor?: string): void
  investigateIncident(incidentId: string, actor?: string): void
  resolveIncident(incidentId: string, note?: string, actor?: string): void
  assignIncidentTo(incidentId: string, assignee: string): void
  /** Opens an incident by hand. Returns its id, or null if not ready. */
  raiseIncident(input: ManualIncidentInput): string | null
  completeDeliveryNow(deliveryId: string): void
  cancelDeliveryNow(deliveryId: string, reason: string): void
  /** Hands a live delivery to another vehicle, keeping its progress. */
  reassignDeliveryTo(
    deliveryId: string,
    vehicleId: string,
    reason?: string
  ): boolean
  setDeliveryPriorityTo(deliveryId: string, priority: DeliveryPriority): boolean
  /** Reverses a cancellation by putting the order back on a free vehicle. */
  restoreCancelledDelivery(deliveryId: string, vehicleId: string): boolean
  /** Idle vehicles that could take this delivery, nearest first. */
  reassignmentCandidates(deliveryId: string): readonly Vehicle[]
  /** Dispatches a fresh order, optionally onto a named corridor. */
  dispatchDelivery(routeId?: string): string | null
  /** Fires one scenario immediately — used by the command palette. */
  injectScenario(kind: SimulationEventKind): boolean
  /** Replaces the zone set the movement tick evaluates against. */
  setGeofences(zones: readonly Geofence[]): void
}

/** What the operator supplies when opening an incident by hand. */
export interface ManualIncidentInput {
  readonly type: IncidentType
  readonly severity: Severity
  readonly title: string
  readonly description: string
  readonly vehicleId?: string | null
  readonly region?: RegionId | null
  readonly actor: string
}

export interface SimulationEngine extends SimulationCommands {
  initialise(bootstrap: BootstrapData): void
  start(): void
  pause(): void
  /** Rebuilds the world from the original seed and republishes the snapshot. */
  reset(): void
  setRate(rate: EventRate): void
  setToggles(toggles: SimulationToggles): void
  getConfig(): SimulationConfig
  getStatus(): SimulationStatus
  isReady(): boolean
  /** Current simulated time. The whole app reads "now" from here. */
  now(): number
  /** Registers the handler that receives a fresh snapshot after a reset. */
  onReset(handler: (snapshot: OperationsSnapshot) => void): () => void
  /** Escape hatch for tests: run one tick of a named task by hand. */
  step(task: "movement" | "events", elapsedMs: number): void
  dispose(): void
}

export interface EngineOptions {
  readonly emit: Emit
  readonly telemetry?: TelemetryBuffer
  readonly timers?: SchedulerTimers
  readonly seed?: number
}

export function createSimulationEngine(
  options: EngineOptions
): SimulationEngine {
  const telemetry = options.telemetry ?? telemetryBuffer
  const scheduler: Scheduler = createScheduler(options.timers ?? realTimers)

  let world: World | null = null
  let origin: Required<GenerateOptions> | null = null
  let config: SimulationConfig = { rate: "normal", toggles: DEFAULT_TOGGLES }
  let status: SimulationStatus = {
    running: false,
    tick: 0,
    startedAt: null,
    eventsEmitted: 0,
    lastEventAt: null,
  }
  const resetHandlers = new Set<(snapshot: OperationsSnapshot) => void>()
  let geofences: readonly Geofence[] = []

  /**
   * Lifecycle announcements bypass the counter. "Events emitted" is a measure
   * of operational activity, and start/pause/reset are statements about the
   * engine itself — counting them would inflate the figure and, worse, leave a
   * freshly reset engine reporting that it had already emitted something.
   */
  const announce: Emit = (name, payload) => {
    options.emit(name, payload)
  }

  /** Wraps the caller's emit so the engine can count what it publishes. */
  const emit: Emit = (name, payload) => {
    status = {
      ...status,
      eventsEmitted: status.eventsEmitted + 1,
      lastEventAt: Date.now(),
    }
    options.emit(name, payload)
  }

  const requireWorld = (): World => {
    if (!world) {
      throw new Error("Simulation engine used before initialise()")
    }
    return world
  }

  const guard = (scope: string, action: () => void): void => {
    try {
      action()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error("simulation", `${scope} failed`, error)
      options.emit("simulation.error", { message, scope })
    }
  }

  /**
   * Regenerates the world from the original seed and start time. Because
   * generation is fully deterministic this reproduces the opening dataset
   * exactly, which is what "Reset simulation" promises.
   */
  const buildWorld = (
    source: Required<GenerateOptions>
  ): { readonly world: World; readonly snapshot: OperationsSnapshot } => {
    const bootstrap = generateBootstrapData(source)
    return {
      world: createWorld({
        clock: createClock(source.now),
        rng: createRng(source.seed + 1),
        snapshot: bootstrap.snapshot,
        kinematics: bootstrap.kinematics,
        counters: bootstrap.counters,
      }),
      snapshot: bootstrap.snapshot,
    }
  }

  const runMovement = (elapsedMs: number): void => {
    guard("movement", () => {
      const current = requireWorld()
      integrateMovement(current, emit, {
        realDeltaMs: elapsedMs,
        closeOnArrival: config.toggles.deliveryCompletions,
        telemetry,
      })

      // Evaluated after movement, so a crossing is detected against the
      // position the operator is about to see rather than the previous one.
      if (geofences.length > 0) {
        evaluateGeofences(current, emit, geofences)
      }
    })
  }

  const runEvents = (): void => {
    guard("events", () => {
      const current = requireWorld()
      const burst = RATE_BURST[config.rate]
      let emitted = 0

      for (let index = 0; index < burst; index += 1) {
        if (generateOperationalEvent(current, emit, config.toggles) !== null) {
          emitted += 1
        }
      }

      status = { ...status, tick: status.tick + 1 }
      emit("simulation.tick", {
        tick: status.tick,
        at: current.clock.now(),
        emitted,
      })
    })
  }

  const registerTasks = (): void => {
    scheduler.set({
      name: MOVEMENT_TASK,
      intervalMs: MOVEMENT_INTERVAL_MS,
      run: runMovement,
    })
    scheduler.set({
      name: EVENTS_TASK,
      intervalMs: RATE_INTERVALS[config.rate],
      run: runEvents,
    })
  }

  return {
    initialise(bootstrap) {
      const clock = createClock(bootstrap.snapshot.generatedAt)
      origin = bootstrap.options
      setOperationsClock(clock)
      world = createWorld({
        clock,
        rng: createRng(bootstrap.options.seed + 1),
        snapshot: bootstrap.snapshot,
        kinematics: bootstrap.kinematics,
        counters: bootstrap.counters,
      })
      seedTelemetry(world, telemetry)
      registerTasks()
    },

    start() {
      if (!world || status.running) {
        return
      }
      status = {
        ...status,
        running: true,
        startedAt: status.startedAt ?? Date.now(),
      }
      scheduler.start()
      announce("simulation.started", { at: Date.now() })
    },

    pause() {
      if (!status.running) {
        return
      }
      scheduler.stop()
      status = { ...status, running: false }
      announce("simulation.paused", { at: Date.now() })
    },

    reset() {
      const source = origin
      if (!source) {
        return
      }

      const wasRunning = status.running
      scheduler.stop()

      const rebuilt = buildWorld(source)
      world = rebuilt.world
      setOperationsClock(rebuilt.world.clock)
      seedTelemetry(world, telemetry)
      // Zones survive a reset — they are the operator's configuration, not
      // simulation state — but every vehicle is back at its seeded position,
      // so the occupancy records describing where they used to be are void.
      clearGeofenceState()
      status = {
        running: false,
        tick: 0,
        startedAt: null,
        eventsEmitted: 0,
        lastEventAt: null,
      }

      for (const handler of [...resetHandlers]) {
        handler(rebuilt.snapshot)
      }

      announce("simulation.reset", { at: Date.now(), reason: "Operator reset" })

      if (wasRunning) {
        status = { ...status, running: true, startedAt: Date.now() }
        scheduler.start()
        announce("simulation.started", { at: Date.now() })
      }
    },

    setRate(rate) {
      if (config.rate === rate) {
        return
      }
      config = { ...config, rate }
      scheduler.retime(EVENTS_TASK, RATE_INTERVALS[rate])
    },

    setToggles(toggles) {
      config = { ...config, toggles }
    },

    getConfig: () => config,
    getStatus: () => status,
    isReady: () => world !== null,
    now: () => world?.clock.now() ?? Date.now(),

    onReset(handler) {
      resetHandlers.add(handler)
      return () => {
        resetHandlers.delete(handler)
      }
    },

    step(task, elapsedMs) {
      scheduler.step(task === "movement" ? MOVEMENT_TASK : EVENTS_TASK, elapsedMs)
    },

    acknowledgeAlert(alertId) {
      guard("acknowledgeAlert", () => {
        transitionAlert(requireWorld(), emit, alertId, "ACKNOWLEDGED")
      })
    },

    dismissAlert(alertId) {
      guard("dismissAlert", () => {
        transitionAlert(requireWorld(), emit, alertId, "DISMISSED")
      })
    },

    resolveAlert(alertId) {
      guard("resolveAlert", () => {
        transitionAlert(requireWorld(), emit, alertId, "RESOLVED")
      })
    },

    acknowledgeIncident(incidentId, actor = "Control room") {
      guard("acknowledgeIncident", () => {
        transitionIncident(requireWorld(), emit, {
          incidentId,
          to: "ACKNOWLEDGED",
          note: "Acknowledged by control room",
          actor,
        })
      })
    },

    investigateIncident(incidentId, actor = "Control room") {
      guard("investigateIncident", () => {
        transitionIncident(requireWorld(), emit, {
          incidentId,
          to: "INVESTIGATING",
          note: "Driver contacted, recovery being arranged",
          actor,
        })
      })
    },

    resolveIncident(
      incidentId,
      note = "Resolved by control room",
      actor = "Control room"
    ) {
      guard("resolveIncident", () => {
        transitionIncident(requireWorld(), emit, {
          incidentId,
          to: "RESOLVED",
          note,
          actor,
        })
      })
    },

    assignIncidentTo(incidentId, assignee) {
      guard("assignIncident", () => {
        const name = DISPATCHERS.includes(assignee)
          ? assignee
          : (DISPATCHERS[0] ?? assignee)
        assignIncident(requireWorld(), emit, incidentId, name)
      })
    },

    raiseIncident(input) {
      let created: string | null = null
      guard("raiseIncident", () => {
        const incident = createIncident(requireWorld(), emit, {
          type: input.type,
          title: input.title,
          description: input.description,
          severity: input.severity,
          vehicleId: input.vehicleId ?? null,
          region: input.region ?? null,
          actor: input.actor,
          note: `Raised by ${input.actor}`,
        })
        created = incident.id
      })
      return created
    },

    completeDeliveryNow(deliveryId) {
      guard("completeDelivery", () => {
        completeDelivery(requireWorld(), emit, deliveryId)
      })
    },

    cancelDeliveryNow(deliveryId, reason) {
      guard("cancelDelivery", () => {
        cancelDelivery(requireWorld(), emit, deliveryId, reason)
      })
    },

    reassignDeliveryTo(deliveryId, vehicleId, reason = "Reassigned by dispatcher") {
      let applied = false
      guard("reassignDelivery", () => {
        applied =
          reassignDelivery(requireWorld(), emit, deliveryId, vehicleId, reason) !==
          null
      })
      return applied
    },

    restoreCancelledDelivery(deliveryId, vehicleId) {
      let applied = false
      guard("restoreDelivery", () => {
        applied = restoreDelivery(requireWorld(), emit, deliveryId, vehicleId)
      })
      return applied
    },

    setDeliveryPriorityTo(deliveryId, priority) {
      let applied = false
      guard("setDeliveryPriority", () => {
        applied = setDeliveryPriority(requireWorld(), emit, deliveryId, priority)
      })
      return applied
    },

    reassignmentCandidates(deliveryId) {
      if (!world) {
        return []
      }
      return candidateVehiclesFor(world, deliveryId)
    },

    dispatchDelivery(routeId) {
      let created: string | null = null
      guard("dispatchDelivery", () => {
        const result = dispatchNewDelivery(
          requireWorld(),
          emit,
          routeId === undefined ? {} : { routeId }
        )
        created = result?.delivery.id ?? null
      })
      return created
    },

    setGeofences(zones) {
      geofences = zones
      // Occupancy describes the old zone set, so it is dropped wholesale. A
      // stale record would report an exit from a zone that no longer exists.
      clearGeofenceState()
    },

    injectScenario(kind) {
      let applied = false
      guard("injectScenario", () => {
        applied = runEventKind(requireWorld(), emit, kind)
      })
      return applied
    },

    dispose() {
      scheduler.stop()
      scheduler.remove(MOVEMENT_TASK)
      scheduler.remove(EVENTS_TASK)
      resetHandlers.clear()
      world = null
    },
  }
}
