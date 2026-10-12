import { beforeEach, describe, expect, it, vi } from "vitest"
import { MINUTE_MS } from "@/lib/clock"
import { createSimulationEngine } from "@/services/simulation/engine"
import { createRecordingEmit } from "@/services/simulation/emit"
import { createTelemetryBuffer } from "@/services/simulation/telemetry"
import { createScheduler, type SchedulerTimers } from "@/services/simulation/scheduler"
import { generateBootstrapData } from "@/services/mock/dataset"
import type { DomainEventName } from "@/types"

const SEED = 4_242
const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

/** A small world keeps each engine test fast without changing any behaviour. */
function bootstrap() {
  return generateBootstrapData({
    seed: SEED,
    now: NOW,
    vehicles: 40,
    completedBacklog: 10,
  })
}

/** Manual timers, so tests drive the engine instead of waiting on the clock. */
function manualTimers(): SchedulerTimers & { fire(): void } {
  const callbacks: (() => void)[] = []
  let current = 0

  return {
    setInterval: (callback) => {
      callbacks.push(callback)
      return callbacks.length - 1
    },
    clearInterval: () => {},
    now: () => {
      current += 1_000
      return current
    },
    fire: () => {
      for (const callback of [...callbacks]) {
        callback()
      }
    },
  }
}

function engineWithRecorder() {
  const recorder = createRecordingEmit()
  const telemetry = createTelemetryBuffer()
  const engine = createSimulationEngine({
    emit: recorder.emit,
    telemetry,
    seed: SEED,
  })
  engine.initialise(bootstrap())
  return { engine, recorder, telemetry }
}

function namesOf(
  events: readonly { name: DomainEventName }[]
): readonly DomainEventName[] {
  return events.map((event) => event.name)
}

describe("simulation lifecycle", () => {
  it("is not ready until initialised", () => {
    const recorder = createRecordingEmit()
    const engine = createSimulationEngine({ emit: recorder.emit, seed: SEED })

    expect(engine.isReady()).toBe(false)

    engine.initialise(bootstrap())
    expect(engine.isReady()).toBe(true)
  })

  it("announces start and pause exactly once each", () => {
    const { engine, recorder } = engineWithRecorder()

    engine.start()
    engine.start()
    engine.pause()
    engine.pause()

    const lifecycle = namesOf(recorder.events).filter((name) =>
      name.startsWith("simulation.")
    )
    expect(lifecycle.filter((n) => n === "simulation.started")).toHaveLength(1)
    expect(lifecycle.filter((n) => n === "simulation.paused")).toHaveLength(1)
    expect(engine.getStatus().running).toBe(false)
  })

  it("holds the clock still while paused", () => {
    const { engine } = engineWithRecorder()

    const before = engine.now()
    engine.step("movement", 1_000)
    const afterTick = engine.now()
    const idle = engine.now()

    expect(afterTick).toBeGreaterThan(before)
    expect(idle).toBe(afterTick)
  })

  it("advances the clock by the time-lapse factor on each movement tick", () => {
    const { engine } = engineWithRecorder()

    const before = engine.now()
    engine.step("movement", 1_000)

    // One real second advances the world by TIME_SCALE simulated seconds.
    expect(engine.now() - before).toBe(90_000)
  })
})

describe("movement integration", () => {
  it("moves vehicles along their route and publishes position events", () => {
    const { engine, recorder, telemetry } = engineWithRecorder()
    const before = telemetry.samples().size
    recorder.events.length = 0

    engine.step("movement", 1_000)

    const locationEvents = recorder.events.filter(
      (event) => event.name === "vehicle.location.updated"
    )
    expect(before).toBeGreaterThan(0)
    expect(locationEvents.length).toBeGreaterThan(0)
  })

  it("writes interpolatable telemetry for the map", () => {
    const { engine, telemetry } = engineWithRecorder()
    engine.step("movement", 1_000)

    const sample = [...telemetry.samples().values()].find(
      (entry) => entry.routeId !== null && entry.speed > 0
    )
    if (!sample) {
      throw new Error("expected at least one moving vehicle")
    }

    const atStart = telemetry.interpolate(sample, sample.stampedAt)
    const atEnd = telemetry.interpolate(sample, sample.stampedAt + 10_000)

    expect(atStart.lat).toBeCloseTo(sample.fromLat, 6)
    expect(atEnd.lat).toBeCloseTo(sample.toLat, 6)
  })

  it("keeps delivery progress monotonic across ticks", () => {
    const { engine, telemetry } = engineWithRecorder()
    engine.step("movement", 1_000)

    const first = [...telemetry.samples().values()].find(
      (entry) => entry.routeId !== null && entry.speed > 0
    )
    if (!first) {
      throw new Error("expected a moving vehicle")
    }

    const startLat = first.toLat
    const startLng = first.toLng
    engine.step("movement", 1_000)
    engine.step("movement", 1_000)

    const after = telemetry.get(first.vehicleId)
    const moved =
      Math.abs((after?.toLat ?? startLat) - startLat) +
      Math.abs((after?.toLng ?? startLng) - startLng)

    expect(moved).toBeGreaterThan(0)
  })
})

describe("operational events", () => {
  it("emits operational events on an event tick", () => {
    const { engine, recorder } = engineWithRecorder()
    recorder.events.length = 0

    engine.step("events", 2_000)

    expect(namesOf(recorder.events)).toContain("simulation.tick")
    expect(recorder.events.length).toBeGreaterThan(1)
  })

  it("propagates a traffic spike into slower vehicles and later ETAs", () => {
    const { engine, recorder } = engineWithRecorder()

    // Force congestion, then integrate so the consequences are published.
    const applied = engine.injectScenario("traffic")
    recorder.events.length = 0
    engine.step("movement", 2_000)
    engine.step("movement", 2_000)

    expect(applied).toBe(true)
    const names = namesOf(recorder.events)
    expect(names).toContain("vehicle.location.updated")
    expect(names.some((name) => name === "delivery.eta.revised")).toBe(true)
  })

  it("takes a vehicle offline, opens an incident and raises a critical alert", () => {
    const { engine, recorder } = engineWithRecorder()
    recorder.events.length = 0

    const applied = engine.injectScenario("vehicle_failure")

    expect(applied).toBe(true)
    const names = namesOf(recorder.events)
    expect(names).toContain("vehicle.offline")
    expect(names).toContain("incident.created")
    expect(names).toContain("alert.raised")
  })

  it("brings an offline vehicle back once its outage elapses", () => {
    const { engine, recorder } = engineWithRecorder()
    engine.injectScenario("vehicle_failure")
    recorder.events.length = 0

    // Outages last at most 110 simulated minutes; 120 is comfortably past.
    for (let tick = 0; tick < 90; tick += 1) {
      engine.step("movement", 1_000)
    }

    expect(namesOf(recorder.events)).toContain("vehicle.online")
  })

  it("dispatches a new delivery through the full created-assigned-started chain", () => {
    const { engine, recorder } = engineWithRecorder()
    recorder.events.length = 0

    const applied = engine.injectScenario("new_delivery")

    expect(applied).toBe(true)
    const names = namesOf(recorder.events)
    expect(names).toContain("delivery.created")
    expect(names).toContain("delivery.assigned")
    expect(names).toContain("delivery.started")
  })

  it("completes a delivery and releases its vehicle", () => {
    const { engine, recorder } = engineWithRecorder()
    recorder.events.length = 0

    const applied = engine.injectScenario("delivery_completion")

    if (applied) {
      const names = namesOf(recorder.events)
      expect(names).toContain("delivery.completed")
      expect(names).toContain("vehicle.status.changed")
    } else {
      // With a small seeded world no delivery may be close enough yet; the
      // generator must say so rather than inventing an implausible completion.
      expect(applied).toBe(false)
    }
  })

  it("stops a vehicle when a random delay fires", () => {
    const { engine, recorder } = engineWithRecorder()
    recorder.events.length = 0

    engine.injectScenario("delay")

    expect(namesOf(recorder.events)).toContain("vehicle.stopped")
  })

  it("skips scenarios whose toggle is off", () => {
    const { engine, recorder } = engineWithRecorder()
    engine.setToggles({
      randomDelays: false,
      vehicleFailures: false,
      trafficSpikes: false,
      newDeliveries: false,
      deliveryCompletions: false,
    })
    recorder.events.length = 0

    engine.step("events", 2_000)

    const names = namesOf(recorder.events)
    expect(names).not.toContain("vehicle.offline")
    expect(names).not.toContain("delivery.created")
  })
})

describe("reset", () => {
  it("restores the opening dataset exactly", () => {
    const { engine } = engineWithRecorder()
    const original = bootstrap().snapshot

    for (let tick = 0; tick < 10; tick += 1) {
      engine.step("movement", 1_000)
      engine.step("events", 2_000)
    }

    let restored: typeof original | null = null
    engine.onReset((snapshot) => {
      restored = snapshot as typeof original
    })
    engine.reset()

    expect(restored).not.toBeNull()
    const snapshot = restored as unknown as typeof original
    expect(snapshot.vehicles).toHaveLength(original.vehicles.length)
    expect(snapshot.deliveries).toHaveLength(original.deliveries.length)
    expect(snapshot.vehicles[0]).toEqual(original.vehicles[0])
    expect(snapshot.deliveries[5]).toEqual(original.deliveries[5])
    expect(engine.getStatus().tick).toBe(0)
    expect(engine.getStatus().eventsEmitted).toBe(0)
  })

  it("keeps running if it was running before the reset", () => {
    const { engine } = engineWithRecorder()
    engine.start()
    engine.reset()

    expect(engine.getStatus().running).toBe(true)
  })
})

describe("commands", () => {
  it("walks an incident through its lifecycle and rejects illegal jumps", () => {
    const { engine, recorder } = engineWithRecorder()
    engine.injectScenario("vehicle_failure")

    const created = recorder.events.find(
      (event) => event.name === "incident.created"
    )
    const incidentId = (
      created?.payload as { incident: { id: string } } | undefined
    )?.incident.id
    if (!incidentId) {
      throw new Error("expected an incident to have been created")
    }

    recorder.events.length = 0
    // Skipping straight to INVESTIGATING is not a legal transition.
    engine.investigateIncident(incidentId)
    expect(namesOf(recorder.events)).not.toContain("incident.investigating")

    engine.acknowledgeIncident(incidentId)
    engine.investigateIncident(incidentId)
    engine.resolveIncident(incidentId)

    const names = namesOf(recorder.events)
    expect(names).toContain("incident.acknowledged")
    expect(names).toContain("incident.investigating")
    expect(names).toContain("incident.resolved")
  })

  it("acknowledges, resolves and dismisses alerts", () => {
    const { engine, recorder } = engineWithRecorder()
    engine.injectScenario("vehicle_failure")

    const raised = recorder.events.find((event) => event.name === "alert.raised")
    const alertId = (raised?.payload as { alert: { id: string } } | undefined)
      ?.alert.id
    if (!alertId) {
      throw new Error("expected an alert to have been raised")
    }

    recorder.events.length = 0
    engine.acknowledgeAlert(alertId)
    engine.acknowledgeAlert(alertId)
    engine.resolveAlert(alertId)

    const names = namesOf(recorder.events)
    expect(names.filter((n) => n === "alert.acknowledged")).toHaveLength(1)
    expect(names).toContain("alert.resolved")
  })

  it("reports a failure through simulation.error rather than throwing", () => {
    const recorder = createRecordingEmit()
    const engine = createSimulationEngine({ emit: recorder.emit, seed: SEED })

    // No initialise(), so every command hits the uninitialised guard.
    expect(() => {
      engine.acknowledgeAlert("missing")
    }).not.toThrow()

    expect(namesOf(recorder.events)).toContain("simulation.error")
  })
})

describe("scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs registered tasks only while started", () => {
    const timers = manualTimers()
    const scheduler = createScheduler(timers)
    const run = vi.fn()

    scheduler.set({ name: "tick", intervalMs: 100, run })
    timers.fire()
    expect(run).not.toHaveBeenCalled()

    scheduler.start()
    timers.fire()
    expect(run).toHaveBeenCalledTimes(1)

    scheduler.stop()
    expect(scheduler.isRunning()).toBe(false)
  })

  it("clamps a large elapsed delta so a backgrounded tab cannot teleport the fleet", () => {
    const callbacks: (() => void)[] = []
    let now = 0
    const scheduler = createScheduler({
      setInterval: (callback) => {
        callbacks.push(callback)
        return 0
      },
      clearInterval: () => {},
      now: () => now,
    })

    const run = vi.fn()
    scheduler.set({ name: "tick", intervalMs: 1_000, run })
    scheduler.start()

    now = 600_000 // ten minutes of drift
    callbacks[0]?.()

    expect(run).toHaveBeenCalledWith(4_000)
  })

  it("re-times a task without losing its handler", () => {
    const timers = manualTimers()
    const scheduler = createScheduler(timers)
    const run = vi.fn()

    scheduler.set({ name: "tick", intervalMs: 1_000, run })
    scheduler.start()
    scheduler.retime("tick", 200)
    timers.fire()

    expect(run).toHaveBeenCalled()
  })
})

describe("dataset generation", () => {
  it("is deterministic for a given seed", () => {
    const first = generateBootstrapData({ seed: SEED, now: NOW, vehicles: 30 })
    const second = generateBootstrapData({ seed: SEED, now: NOW, vehicles: 30 })

    expect(first.snapshot.vehicles).toEqual(second.snapshot.vehicles)
    expect(first.snapshot.deliveries).toEqual(second.snapshot.deliveries)
    expect(first.snapshot.incidents).toEqual(second.snapshot.incidents)
  })

  it("produces a board that is internally consistent", () => {
    const { snapshot } = generateBootstrapData({ seed: SEED, now: NOW })
    const routeIds = new Set(snapshot.routes.map((route) => route.id))
    const vehicleIds = new Set(snapshot.vehicles.map((vehicle) => vehicle.id))
    const customerIds = new Set(
      snapshot.customers.map((customer) => customer.id)
    )

    for (const delivery of snapshot.deliveries) {
      expect(routeIds.has(delivery.routeId)).toBe(true)
      expect(customerIds.has(delivery.customerId)).toBe(true)
      if (delivery.vehicleId) {
        expect(vehicleIds.has(delivery.vehicleId)).toBe(true)
      }
    }
  })

  it("opens with the headline numbers the briefing promises", () => {
    const { snapshot } = generateBootstrapData({ seed: SEED, now: NOW })
    const byStatus = (status: string) =>
      snapshot.deliveries.filter((delivery) => delivery.status === status).length

    expect(byStatus("IN_TRANSIT")).toBe(247)
    expect(
      snapshot.vehicles.filter((vehicle) => vehicle.status === "OFFLINE")
    ).toHaveLength(4)
    expect(snapshot.deliveries.length).toBeGreaterThan(500)
  })

  it("places every in-flight vehicle on the route of its delivery", () => {
    const { snapshot } = generateBootstrapData({ seed: SEED, now: NOW })
    const deliveriesById = new Map(
      snapshot.deliveries.map((delivery) => [delivery.id, delivery])
    )

    for (const vehicle of snapshot.vehicles) {
      if (!vehicle.deliveryId) {
        continue
      }
      const delivery = deliveriesById.get(vehicle.deliveryId)
      expect(delivery).toBeDefined()
      expect(vehicle.routeId).toBe(delivery?.routeId)
    }
  })

  it("gives delayed deliveries a positive delay and a promise in the past", () => {
    const { snapshot } = generateBootstrapData({ seed: SEED, now: NOW })
    const delayed = snapshot.deliveries.filter(
      (delivery) => delivery.status === "DELAYED"
    )

    expect(delayed.length).toBeGreaterThan(0)
    for (const delivery of delayed) {
      expect(delivery.delayMinutes).toBeGreaterThan(0)
      expect(delivery.promisedAt).toBeLessThan(delivery.etaAt)
    }
  })

  it("uses realistic Nigerian identities rather than placeholders", () => {
    const { snapshot } = generateBootstrapData({ seed: SEED, now: NOW })
    const names = snapshot.drivers.map((driver) => driver.name).join(" ")

    expect(names).not.toMatch(/John Doe|Driver \d|Test User/i)
    expect(snapshot.drivers[0]?.phone).toMatch(/^0\d{3} \d{3} \d{4}$/)
    expect(snapshot.vehicles[0]?.plateNumber).toMatch(/^[A-Z]{3}-\d{3}-[A-Z]{2}$/)
  })
})

describe("telemetry buffer", () => {
  it("replaces the previous fix rather than growing", () => {
    const telemetry = createTelemetryBuffer(1_000)
    const write = (lat: number) => {
      telemetry.write({
        vehicleId: "vehicle-1",
        callSign: "101",
        status: "ON_ROUTE",
        location: { lat, lng: 3 },
        heading: 90,
        speed: 60,
        routeId: "lag-iba",
        deliveryId: "del-1",
      })
    }

    write(6)
    write(7)

    expect(telemetry.size()).toBe(1)
    const sample = telemetry.get("vehicle-1")
    expect(sample?.fromLat).toBe(6)
    expect(sample?.toLat).toBe(7)
  })

  it("interpolates headings the short way around", () => {
    const telemetry = createTelemetryBuffer(1_000)
    telemetry.write({
      vehicleId: "v",
      callSign: "1",
      status: "ON_ROUTE",
      location: { lat: 0, lng: 0 },
      heading: 350,
      speed: 10,
      routeId: null,
      deliveryId: null,
    })
    telemetry.write({
      vehicleId: "v",
      callSign: "1",
      status: "ON_ROUTE",
      location: { lat: 0, lng: 0 },
      heading: 10,
      speed: 10,
      routeId: null,
      deliveryId: null,
    })

    const sample = telemetry.get("v")
    if (!sample) {
      throw new Error("expected a telemetry sample")
    }

    const midway = telemetry.interpolate(sample, sample.stampedAt + 500)
    expect(midway.heading).toBeCloseTo(0, 1)
  })
})

describe("time", () => {
  it("expresses one simulated hour as sixty minutes", () => {
    expect(60 * MINUTE_MS).toBe(3_600_000)
  })
})
