import { beforeEach, describe, expect, it } from "vitest"
import { createEventBus } from "@/services/event-bus/event-bus"
import { generateBootstrapData } from "@/services/mock/dataset"
import { createSimulationEngine } from "@/services/simulation/engine"
import {
  clearGeofenceState,
  evaluateGeofences,
} from "@/services/simulation/operations"
import { createWorld } from "@/services/simulation/world"
import { createClock } from "@/lib/clock"
import { createRng } from "@/lib/random"
import { createRecorder } from "@/services/simulation/recorder"
import {
  alertThresholds,
  clampThresholds,
  DEFAULT_THRESHOLDS,
  resetAlertThresholds,
  setAlertThresholds,
} from "@/services/simulation/thresholds"
import { useActionJournal } from "@/stores/action-journal"
import type { AnyDomainEvent, Geofence } from "@/types"

const SEED = 4_242
const NOW = Date.UTC(2026, 1, 9, 8, 0, 0)

function buildWorld() {
  const bootstrap = generateBootstrapData({
    seed: SEED,
    now: NOW,
    vehicles: 20,
    completedBacklog: 4,
  })

  return createWorld({
    clock: createClock(NOW),
    rng: createRng(SEED),
    snapshot: bootstrap.snapshot,
    kinematics: bootstrap.kinematics,
    counters: bootstrap.counters,
  })
}

describe("alert thresholds", () => {
  beforeEach(() => {
    resetAlertThresholds()
  })

  it("clamps a value to its documented range", () => {
    const clamped = clampThresholds({ delayedMinutes: 9_000, lowFuelPercent: -4 })
    expect(clamped.delayedMinutes).toBe(120)
    expect(clamped.lowFuelPercent).toBe(1)
  })

  it("falls back to the default for a non-numeric value", () => {
    const clamped = clampThresholds({
      atRiskMinutes: Number.NaN,
    } as { atRiskMinutes: number })

    expect(clamped.atRiskMinutes).toBe(DEFAULT_THRESHOLDS.atRiskMinutes)
  })

  it("is read live, so derivation follows a change immediately", () => {
    expect(alertThresholds().delayedMinutes).toBe(DEFAULT_THRESHOLDS.delayedMinutes)
    setAlertThresholds({ ...DEFAULT_THRESHOLDS, delayedMinutes: 42 })
    expect(alertThresholds().delayedMinutes).toBe(42)
  })
})

describe("geofencing", () => {
  beforeEach(() => {
    clearGeofenceState()
  })

  function zoneAroundFirstVehicle(
    world: ReturnType<typeof buildWorld>,
    overrides: Partial<Geofence> = {}
  ): Geofence {
    const vehicle = [...world.vehicles.values()][0]
    if (!vehicle) {
      throw new Error("expected a vehicle")
    }

    return {
      id: "zone-1",
      name: "Depot",
      centre: vehicle.location,
      radiusKm: 50,
      triggers: ["enter", "exit"],
      dwellMinutes: 5,
      enabled: true,
      createdAt: NOW,
      ...overrides,
    }
  }

  it("raises an enter breach once, not on every tick", () => {
    const world = buildWorld()
    const events: AnyDomainEvent["name"][] = []
    const emit = ((name: string) => {
      events.push(name as AnyDomainEvent["name"])
    }) as Parameters<typeof evaluateGeofences>[1]

    const zone = zoneAroundFirstVehicle(world)

    const first = evaluateGeofences(world, emit, [zone])
    const second = evaluateGeofences(world, emit, [zone])

    expect(first).toBeGreaterThan(0)
    // Occupancy is edge-triggered: a vehicle sitting inside is not news.
    expect(second).toBe(0)
  })

  it("ignores a disabled zone", () => {
    const world = buildWorld()
    const emit = (() => {}) as Parameters<typeof evaluateGeofences>[1]
    const zone = zoneAroundFirstVehicle(world, { enabled: false })

    expect(evaluateGeofences(world, emit, [zone])).toBe(0)
  })

  it("raises an exit breach when the zone moves away from the fleet", () => {
    const world = buildWorld()
    const emit = (() => {}) as Parameters<typeof evaluateGeofences>[1]
    const zone = zoneAroundFirstVehicle(world)

    evaluateGeofences(world, emit, [zone])

    // Shrinking the radius to nothing is equivalent to every vehicle leaving.
    const shrunk: Geofence = { ...zone, radiusKm: 0.0001 }
    expect(evaluateGeofences(world, emit, [shrunk])).toBeGreaterThan(0)
  })
})

describe("replay recorder", () => {
  it("keeps only the most recent frames", () => {
    const recorder = createRecorder(3)
    const { snapshot } = generateBootstrapData({
      seed: SEED,
      now: NOW,
      vehicles: 5,
      completedBacklog: 1,
    })

    for (let index = 0; index < 5; index += 1) {
      recorder.capture(NOW + index, snapshot.vehicles, snapshot.deliveries)
    }

    const frames = recorder.frames()
    expect(frames).toHaveLength(3)
    expect(frames[0]?.at).toBe(NOW + 2)
    expect(frames[2]?.at).toBe(NOW + 4)
  })

  it("captures the mutable fields a restore needs", () => {
    const recorder = createRecorder()
    const { snapshot } = generateBootstrapData({
      seed: SEED,
      now: NOW,
      vehicles: 5,
      completedBacklog: 1,
    })

    recorder.capture(NOW, snapshot.vehicles, snapshot.deliveries)
    const frame = recorder.frames()[0]
    const vehicle = frame?.vehicles[0]
    const source = snapshot.vehicles[0]

    expect(vehicle?.id).toBe(source?.id)
    expect(vehicle?.lat).toBe(source?.location.lat)
    expect(vehicle?.status).toBe(source?.status)
  })
})

describe("action journal", () => {
  beforeEach(() => {
    useActionJournal.getState().clear()
  })

  it("reverses the newest entry first", () => {
    const order: string[] = []
    const journal = useActionJournal.getState()

    journal.record({
      label: "first",
      refusalHint: "",
      undo: () => {
        order.push("first")
        return true
      },
    })
    journal.record({
      label: "second",
      refusalHint: "",
      undo: () => {
        order.push("second")
        return true
      },
    })

    useActionJournal.getState().undoLast()
    useActionJournal.getState().undoLast()

    expect(order).toEqual(["second", "first"])
    expect(useActionJournal.getState().canUndo).toBe(false)
  })

  it("reports a refusal rather than silently dropping it", () => {
    useActionJournal.getState().record({
      label: "doomed",
      refusalHint: "The vehicle moved on.",
      undo: () => false,
    })

    const result = useActionJournal.getState().undoLast()
    expect(result?.applied).toBe(false)
    // The entry is still consumed: retrying would refuse again.
    expect(useActionJournal.getState().entries).toHaveLength(0)
  })

  it("returns null when there is nothing to undo", () => {
    expect(useActionJournal.getState().undoLast()).toBeNull()
  })
})

describe("dispatch commands", () => {
  it("reassigns a delivery to a free vehicle and keeps its progress", () => {
    const bus = createEventBus()
    const engine = createSimulationEngine({
      emit: (name, payload) => {
        bus.emit(name, payload)
      },
      seed: SEED,
    })

    const bootstrap = generateBootstrapData({
      seed: SEED,
      now: NOW,
      vehicles: 30,
      completedBacklog: 4,
    })
    engine.initialise({
      snapshot: bootstrap.snapshot,
      kinematics: bootstrap.kinematics,
      counters: bootstrap.counters,
      options: {
        seed: SEED,
        now: NOW,
        vehicles: 30,
        deliveries: 60,
        completedBacklog: 4,
      },
    })

    const delivery = bootstrap.snapshot.deliveries.find(
      (entry) => entry.status === "IN_TRANSIT" && entry.vehicleId !== null
    )
    if (!delivery) {
      throw new Error("expected an in-transit delivery")
    }

    const candidates = engine.reassignmentCandidates(delivery.id)
    expect(candidates.length).toBeGreaterThan(0)

    const target = candidates[0]
    if (!target) {
      throw new Error("expected a candidate")
    }

    expect(engine.reassignDeliveryTo(delivery.id, target.id)).toBe(true)
    // Reassigning to the same vehicle is a no-op, not a second transfer.
    expect(engine.reassignDeliveryTo(delivery.id, target.id)).toBe(false)

    engine.dispose()
  })

  it("re-grades a delivery and refuses a no-op re-grade", () => {
    const engine = createSimulationEngine({ emit: () => {}, seed: SEED })
    const bootstrap = generateBootstrapData({
      seed: SEED,
      now: NOW,
      vehicles: 20,
      completedBacklog: 2,
    })
    engine.initialise({
      snapshot: bootstrap.snapshot,
      kinematics: bootstrap.kinematics,
      counters: bootstrap.counters,
      options: {
        seed: SEED,
        now: NOW,
        vehicles: 20,
        deliveries: 40,
        completedBacklog: 2,
      },
    })

    const delivery = bootstrap.snapshot.deliveries[0]
    if (!delivery) {
      throw new Error("expected a delivery")
    }

    const next = delivery.priority === "CRITICAL" ? "STANDARD" : "CRITICAL"
    expect(engine.setDeliveryPriorityTo(delivery.id, next)).toBe(true)
    expect(engine.setDeliveryPriorityTo(delivery.id, next)).toBe(false)

    engine.dispose()
  })
})
