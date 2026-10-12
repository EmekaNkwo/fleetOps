import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { generateBootstrapData } from "@/services/mock/dataset"
import { simulationEngine } from "@/services/simulation"
import { connectStores } from "@/stores/event-wiring"
import { applySnapshot } from "@/stores/event-wiring"
import {
  useActivityStore,
  useDeliveryStore,
  useSimulationStore,
  useVehicleStore,
} from "@/stores"

/**
 * The simulation control surface the UI actually drives — the store plus the
 * real engine singleton behind it. Everything here goes through the same path
 * a button press takes.
 */

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)
let disconnect: (() => void) | null = null

function boot() {
  const bootstrap = generateBootstrapData({
    seed: 2_024,
    now: NOW,
    vehicles: 60,
    completedBacklog: 15,
  })
  applySnapshot(bootstrap.snapshot)
  simulationEngine.initialise(bootstrap)
  disconnect = connectStores()
  return bootstrap
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 220))
}

beforeEach(() => {
  boot()
})

afterEach(() => {
  simulationEngine.pause()
  disconnect?.()
  disconnect = null
})

describe("simulation store", () => {
  it("starts and pauses, keeping its status in step with the engine", () => {
    const store = useSimulationStore.getState()

    store.start()
    expect(useSimulationStore.getState().status.running).toBe(true)
    expect(simulationEngine.getStatus().running).toBe(true)

    store.pause()
    expect(useSimulationStore.getState().status.running).toBe(false)
    expect(simulationEngine.getStatus().running).toBe(false)
  })

  it("toggles between running and paused", () => {
    const store = useSimulationStore.getState()

    store.toggle()
    expect(useSimulationStore.getState().status.running).toBe(true)

    useSimulationStore.getState().toggle()
    expect(useSimulationStore.getState().status.running).toBe(false)
  })

  it("persists the event rate", () => {
    useSimulationStore.getState().setRate("fast")

    expect(useSimulationStore.getState().config.rate).toBe("fast")
    expect(simulationEngine.getConfig().rate).toBe("fast")
    expect(window.localStorage.getItem("fleetops:simulation")).toContain("fast")
  })

  it("persists a scenario toggle and forwards it to the engine", () => {
    useSimulationStore.getState().setToggle("vehicleFailures", false)

    expect(useSimulationStore.getState().config.toggles.vehicleFailures).toBe(
      false
    )
    expect(simulationEngine.getConfig().toggles.vehicleFailures).toBe(false)
  })

  it("tracks bootstrap phase and processing failures", () => {
    const store = useSimulationStore.getState()

    store.setPhase("ready")
    expect(useSimulationStore.getState().phase).toBe("ready")

    store.setPhase("error", "gateway down")
    expect(useSimulationStore.getState().error).toBe("gateway down")

    useSimulationStore.getState().recordProcessingError("bad event")
    expect(useSimulationStore.getState().processingErrors).toBeGreaterThan(0)
    expect(useSimulationStore.getState().lastErrorMessage).toBe("bad event")
  })

  it("injects a scenario and projects the result into the stores", async () => {
    const before = useActivityStore.getState().events.length

    const applied = useSimulationStore.getState().injectScenario("traffic")
    await flush()

    expect(applied).toBe(true)
    expect(useActivityStore.getState().events.length).toBeGreaterThan(before)
  })

  it("moves vehicles and revises deliveries when the engine ticks", async () => {
    const vehicleId = useVehicleStore.getState().ids.find((id) => {
      const vehicle = useVehicleStore.getState().byId[id]
      return vehicle?.routeId !== null && vehicle?.status === "ON_ROUTE"
    })
    if (!vehicleId) {
      throw new Error("expected a moving vehicle")
    }

    const before = useVehicleStore.getState().byId[vehicleId]?.location

    simulationEngine.step("movement", 1_000)
    simulationEngine.step("movement", 1_000)
    await flush()

    const after = useVehicleStore.getState().byId[vehicleId]?.location
    expect(after).not.toEqual(before)
  })

  it("restores the opening board on reset", async () => {
    const opening = useDeliveryStore.getState().counts.inTransit

    useSimulationStore.getState().setToggle("newDeliveries", true)
    for (let tick = 0; tick < 12; tick += 1) {
      simulationEngine.step("events", 2_000)
      simulationEngine.step("movement", 1_000)
    }
    await flush()

    useSimulationStore.getState().reset()
    await flush()

    expect(useDeliveryStore.getState().counts.inTransit).toBe(opening)
    expect(useSimulationStore.getState().status.tick).toBe(0)
  })
})
