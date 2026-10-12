import { beforeEach, describe, expect, it, vi } from "vitest"
import { createEventBus } from "@/services/event-bus/event-bus"
import { generateBootstrapData } from "@/services/mock/dataset"
import { applySnapshot, connectStores } from "@/stores/event-wiring"
import {
  useActivityStore,
  useAlertStore,
  useDeliveryStore,
  useIncidentStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type { Alert, Incident } from "@/types"

const SEED = 99
const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

function seedStores() {
  const { snapshot } = generateBootstrapData({
    seed: SEED,
    now: NOW,
    vehicles: 40,
    completedBacklog: 10,
  })
  applySnapshot(snapshot)
  return snapshot
}

/** Advances past the wiring's batch flush interval. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
}

describe("vehicle store", () => {
  beforeEach(() => {
    seedStores()
  })

  it("recomputes fleet counts on every commit", () => {
    const before = useVehicleStore.getState().counts
    const target = useVehicleStore.getState().ids[0]
    if (!target) {
      throw new Error("expected a vehicle")
    }

    useVehicleStore
      .getState()
      .applyPatches([{ id: target, changes: { status: "OFFLINE" } }])

    const after = useVehicleStore.getState().counts
    expect(after.offline).toBe(before.offline + 1)
    expect(after.total).toBe(before.total)
  })

  it("ignores patches for unknown vehicles", () => {
    const before = useVehicleStore.getState().version
    useVehicleStore
      .getState()
      .applyPatches([{ id: "nope", changes: { speed: 10 } }])

    expect(useVehicleStore.getState().version).toBe(before)
  })

  it("applies many patches in a single commit", () => {
    const before = useVehicleStore.getState().version
    const ids = useVehicleStore.getState().ids.slice(0, 5)

    useVehicleStore
      .getState()
      .applyPatches(ids.map((id) => ({ id, changes: { speed: 42 } })))

    expect(useVehicleStore.getState().version).toBe(before + 1)
    for (const id of ids) {
      expect(useVehicleStore.getState().byId[id]?.speed).toBe(42)
    }
  })
})

describe("delivery store", () => {
  beforeEach(() => {
    seedStores()
  })

  it("keeps counts and performance in step with the board", () => {
    const target = useDeliveryStore
      .getState()
      .ids.find(
        (id) => useDeliveryStore.getState().byId[id]?.status === "IN_TRANSIT"
      )
    if (!target) {
      throw new Error("expected an in-transit delivery")
    }

    const before = useDeliveryStore.getState().counts
    useDeliveryStore
      .getState()
      .applyPatches([{ id: target, changes: { status: "DELAYED" } }], NOW)

    const after = useDeliveryStore.getState().counts
    expect(after.inTransit).toBe(before.inTransit - 1)
    expect(after.delayed).toBe(before.delayed + 1)
  })

  it("inserts a new delivery at the head without duplicating it", () => {
    const existing = useDeliveryStore.getState().ids[0]
    if (!existing) {
      throw new Error("expected a delivery")
    }
    const delivery = useDeliveryStore.getState().byId[existing]
    if (!delivery) {
      throw new Error("expected a delivery record")
    }

    const before = useDeliveryStore.getState().ids.length
    useDeliveryStore.getState().insert({ ...delivery, id: "new-1" }, NOW)
    useDeliveryStore.getState().insert({ ...delivery, id: "new-1" }, NOW)

    expect(useDeliveryStore.getState().ids.length).toBe(before + 1)
    expect(useDeliveryStore.getState().ids[0]).toBe("new-1")
  })
})

describe("alert store", () => {
  beforeEach(() => {
    seedStores()
  })

  it("sorts open and critical alerts to the top", () => {
    const { ids, byId } = useAlertStore.getState()
    const ordered = ids
      .map((id) => byId[id])
      .filter((alert): alert is Alert => alert !== undefined)

    const firstSettled = ordered.findIndex((alert) => alert.status !== "OPEN")
    if (firstSettled > 0) {
      expect(ordered.slice(0, firstSettled).every((a) => a.status === "OPEN")).toBe(
        true
      )
    }

    const openAlerts = ordered.filter((alert) => alert.status === "OPEN")
    const firstWarning = openAlerts.findIndex((a) => a.severity !== "CRITICAL")
    if (firstWarning > 0) {
      expect(
        openAlerts.slice(0, firstWarning).every((a) => a.severity === "CRITICAL")
      ).toBe(true)
    }
  })

  it("acknowledges an alert and persists the decision", () => {
    const alertId = useAlertStore.getState().ids[0]
    if (!alertId) {
      throw new Error("expected an alert")
    }

    const before = useAlertStore.getState().openCount
    useAlertStore.getState().setStatus(alertId, "ACKNOWLEDGED", NOW)

    expect(useAlertStore.getState().byId[alertId]?.status).toBe("ACKNOWLEDGED")
    expect(useAlertStore.getState().openCount).toBe(before - 1)
    expect(
      window.localStorage.getItem("fleetops:acknowledged-alerts")
    ).toContain(alertId)
  })

  it("restores acknowledgements from storage on reload", () => {
    const alertId = useAlertStore.getState().ids[0]
    if (!alertId) {
      throw new Error("expected an alert")
    }

    window.localStorage.setItem(
      "fleetops:acknowledged-alerts",
      JSON.stringify([alertId])
    )
    seedStores()

    expect(useAlertStore.getState().byId[alertId]?.status).toBe("ACKNOWLEDGED")
  })
})

describe("incident store", () => {
  beforeEach(() => {
    seedStores()
  })

  it("appends to the log on every transition", () => {
    const incidentId = useIncidentStore
      .getState()
      .ids.find(
        (id) => useIncidentStore.getState().byId[id]?.status !== "RESOLVED"
      )
    if (!incidentId) {
      throw new Error("expected an open incident")
    }

    const before = useIncidentStore.getState().byId[incidentId] as Incident
    useIncidentStore.getState().applyTransition({
      incidentId,
      to: "RESOLVED",
      note: "Cleared",
      actor: "Tester",
      at: NOW,
    })

    const after = useIncidentStore.getState().byId[incidentId] as Incident
    expect(after.status).toBe("RESOLVED")
    expect(after.resolvedAt).toBe(NOW)
    expect(after.log).toHaveLength(before.log.length + 1)
    expect(useIncidentStore.getState().openCount).toBe(
      useIncidentStore.getState().ids.filter(
        (id) => useIncidentStore.getState().byId[id]?.status !== "RESOLVED"
      ).length
    )
  })
})

describe("event wiring", () => {
  beforeEach(() => {
    seedStores()
    useActivityStore.getState().clear()
    useUiStore.setState({ selection: null })
  })

  it("projects a vehicle status event onto the vehicle store", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    const vehicleId = useVehicleStore.getState().ids[0]
    if (!vehicleId) {
      throw new Error("expected a vehicle")
    }

    bus.emit("vehicle.status.changed", {
      vehicleId,
      from: "ON_ROUTE",
      to: "OFFLINE",
      reason: "test",
    })
    await flush()

    expect(useVehicleStore.getState().byId[vehicleId]?.status).toBe("OFFLINE")
    disconnect()
  })

  it("writes a readable line into the activity feed", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    const vehicleId = useVehicleStore.getState().ids[0]
    if (!vehicleId) {
      throw new Error("expected a vehicle")
    }
    const callSign = useVehicleStore.getState().byId[vehicleId]?.callSign

    bus.emit("vehicle.offline", { vehicleId, reason: "Tyre blowout" })
    await flush()

    const events = useActivityStore.getState().events
    expect(events[0]?.message).toContain(`Vehicle ${callSign}`)
    expect(events[0]?.message).toContain("Tyre blowout")
    expect(events[0]?.severity).toBe("CRITICAL")
    disconnect()
  })

  it("suppresses position fixes for vehicles the operator is not watching", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    const [watched, other] = useVehicleStore.getState().ids
    if (!watched || !other) {
      throw new Error("expected two vehicles")
    }

    useUiStore.getState().selectVehicle(watched)

    const payload = {
      location: { lat: 6, lng: 3 },
      heading: 90,
      speed: 60,
      routeId: null,
      travelledKm: 10,
    }
    bus.emit("vehicle.location.updated", { vehicleId: other, ...payload })
    bus.emit("vehicle.location.updated", { vehicleId: watched, ...payload })
    await flush()

    const messages = useActivityStore
      .getState()
      .events.map((event) => event.message)
    expect(messages.filter((m) => m.includes("position updated"))).toHaveLength(1)
    disconnect()
  })

  it("batches a burst of events into a single store commit", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    const ids = useVehicleStore.getState().ids.slice(0, 20)
    const before = useVehicleStore.getState().version

    for (const vehicleId of ids) {
      bus.emit("vehicle.location.updated", {
        vehicleId,
        location: { lat: 6, lng: 3 },
        heading: 90,
        speed: 55,
        routeId: null,
        travelledKm: 5,
      })
    }
    await flush()

    // Twenty events, one commit — this is the render-storm defence.
    expect(useVehicleStore.getState().version).toBe(before + 1)
    expect(useVehicleStore.getState().byId[ids[0] as string]?.speed).toBe(55)
    disconnect()
  })

  it("records a processing failure instead of breaking the stream", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    const onError = vi.fn()
    bus.onError(onError)

    bus.on("vehicle.offline", () => {
      throw new Error("subscriber blew up")
    })
    bus.emit("vehicle.offline", { vehicleId: "ghost", reason: "test" })
    await flush()

    expect(onError).toHaveBeenCalled()
    disconnect()
  })

  it("stops projecting once disconnected", async () => {
    const bus = createEventBus()
    const disconnect = connectStores(bus)
    disconnect()

    const vehicleId = useVehicleStore.getState().ids[0]
    if (!vehicleId) {
      throw new Error("expected a vehicle")
    }
    bus.emit("vehicle.status.changed", {
      vehicleId,
      from: "ON_ROUTE",
      to: "OFFLINE",
      reason: "test",
    })
    await flush()

    expect(useVehicleStore.getState().byId[vehicleId]?.status).not.toBe(
      "OFFLINE"
    )
  })
})

describe("ui store", () => {
  beforeEach(() => {
    useUiStore.setState({
      selection: null,
      panel: null,
      commandPaletteOpen: false,
      searchOpen: false,
      introVisible: false,
    })
  })

  it("closes layers from the top down on escape", () => {
    const store = useUiStore.getState()
    store.selectVehicle("vehicle-1")
    store.openPanel("alerts")
    store.setCommandPaletteOpen(true)

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().selection).toBeNull()

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().panel).toBeNull()

    expect(useUiStore.getState().dismissTopLayer()).toBe(false)
  })

  it("persists filter choices but not the search query", () => {
    useUiStore.getState().setVehicleStatusFilter("OFFLINE")
    useUiStore.getState().setQuery("ephemeral")

    const stored = window.localStorage.getItem("fleetops:filters")
    expect(stored).toContain("OFFLINE")
    expect(stored).not.toContain("ephemeral")
  })

  it("resets pagination when the board is filtered", () => {
    useUiStore.getState().setTablePage(4)
    useUiStore.getState().setDeliveryStatusFilter("DELAYED")

    expect(useUiStore.getState().table.page).toBe(0)
  })

  it("toggles a region on and off", () => {
    useUiStore.getState().toggleRegion("lagos")
    expect(useUiStore.getState().filters.regions).toEqual(["lagos"])

    useUiStore.getState().toggleRegion("lagos")
    expect(useUiStore.getState().filters.regions).toEqual([])
  })

  it("flips sort direction when the same column is chosen twice", () => {
    useUiStore.getState().sortTable("delay")
    expect(useUiStore.getState().table.sortDirection).toBe("asc")

    useUiStore.getState().sortTable("delay")
    expect(useUiStore.getState().table.sortDirection).toBe("desc")

    useUiStore.getState().sortTable("customer")
    expect(useUiStore.getState().table.sortBy).toBe("customer")
    expect(useUiStore.getState().table.sortDirection).toBe("asc")
  })
})

describe("escape ordering", () => {
  beforeEach(() => {
    useUiStore.setState({
      selection: null,
      panel: null,
      commandPaletteOpen: false,
      searchOpen: false,
      introVisible: false,
    })
  })

  it("closes a panel before an incident selection hiding inside it", () => {
    const store = useUiStore.getState()
    store.selectIncident("incident-1")
    store.openPanel("simulation")

    // The incident expansion is not an overlay, so the visible panel goes
    // first. Clearing the selection here would eat the keystroke silently.
    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().panel).toBeNull()
    expect(useUiStore.getState().selection).toBeNull()
  })

  it("still closes a slide-over selection before the panel behind it", () => {
    const store = useUiStore.getState()
    store.openPanel("alerts")
    store.selectVehicle("vehicle-1")

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().selection).toBeNull()
    expect(useUiStore.getState().panel).toBe("alerts")

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().panel).toBeNull()
  })

  it("clears a lone incident selection once nothing else is open", () => {
    useUiStore.getState().selectIncident("incident-1")

    expect(useUiStore.getState().dismissTopLayer()).toBe(true)
    expect(useUiStore.getState().selection).toBeNull()
    expect(useUiStore.getState().dismissTopLayer()).toBe(false)
  })
})
