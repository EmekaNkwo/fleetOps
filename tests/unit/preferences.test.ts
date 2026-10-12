import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_FILTERS,
  DEFAULT_SIMULATION_CONFIG,
  preferences,
} from "@/services/storage/preferences"
import {
  readValue,
  resetStorageAvailabilityCache,
  storageKey,
  writeValue,
} from "@/services/storage/local-storage"

beforeEach(() => {
  window.localStorage.clear()
  resetStorageAvailabilityCache()
})

describe("local storage wrapper", () => {
  it("round-trips a value", () => {
    writeValue("probe", { a: 1 })
    expect(
      readValue("probe", (raw) => raw as { a: number }, { a: 0 })
    ).toEqual({ a: 1 })
  })

  it("namespaces every key", () => {
    writeValue("probe", 1)
    expect(window.localStorage.getItem(storageKey("probe"))).toBe("1")
    expect(storageKey("probe")).toBe("fleetops:probe")
  })

  it("falls back when nothing is stored", () => {
    expect(readValue("absent", () => null, "fallback")).toBe("fallback")
  })

  it("falls back on malformed JSON rather than throwing", () => {
    window.localStorage.setItem(storageKey("broken"), "{not json")
    expect(readValue("broken", () => null, "safe")).toBe("safe")
  })

  it("survives storage being unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })
    resetStorageAvailabilityCache()

    expect(() => {
      writeValue("probe", 1)
    }).not.toThrow()
    expect(readValue("probe", () => null, "fallback")).toBe("fallback")

    setItem.mockRestore()
    resetStorageAvailabilityCache()
  })
})

describe("preferences", () => {
  it("returns defaults on a cold start", () => {
    expect(preferences.loadFilters()).toEqual(DEFAULT_FILTERS)
    expect(preferences.loadSimulation()).toEqual(DEFAULT_SIMULATION_CONFIG)
    expect(preferences.loadWorkspace()).toBe("map")
    expect(preferences.loadIntroSeen()).toBe(false)
  })

  it("persists and restores filters", () => {
    preferences.saveFilters({
      vehicleStatus: "OFFLINE",
      deliveryStatus: "DELAYED",
      regions: ["lagos", "kano"],
      query: "ignored",
    })

    const restored = preferences.loadFilters()
    expect(restored.vehicleStatus).toBe("OFFLINE")
    expect(restored.deliveryStatus).toBe("DELAYED")
    expect(restored.regions).toEqual(["lagos", "kano"])
    // The query is session scoped: restoring it would hide the board with no
    // visible cause.
    expect(restored.query).toBe("")
  })

  it("discards values that are no longer valid", () => {
    window.localStorage.setItem(
      storageKey("filters"),
      JSON.stringify({
        vehicleStatus: "MADE_UP",
        deliveryStatus: 42,
        regions: ["lagos", "atlantis", 7],
      })
    )

    const restored = preferences.loadFilters()
    expect(restored.vehicleStatus).toBe("ALL")
    expect(restored.deliveryStatus).toBe("ALL")
    expect(restored.regions).toEqual(["lagos"])
  })

  it("persists simulation settings including toggles", () => {
    preferences.saveSimulation({
      rate: "fast",
      toggles: {
        randomDelays: false,
        vehicleFailures: true,
        trafficSpikes: false,
        newDeliveries: true,
        deliveryCompletions: true,
      },
    })

    const restored = preferences.loadSimulation()
    expect(restored.rate).toBe("fast")
    expect(restored.toggles.randomDelays).toBe(false)
    expect(restored.toggles.trafficSpikes).toBe(false)
  })

  it("rejects an unknown event rate", () => {
    window.localStorage.setItem(
      storageKey("simulation"),
      JSON.stringify({ rate: "ludicrous" })
    )
    expect(preferences.loadSimulation().rate).toBe("normal")
  })

  it("persists table layout and rejects an unsupported page size", () => {
    preferences.saveTable({ pageSize: 50, hiddenColumns: ["driver"] })
    expect(preferences.loadTable()).toEqual({
      pageSize: 50,
      hiddenColumns: ["driver"],
    })

    window.localStorage.setItem(
      storageKey("table"),
      JSON.stringify({ pageSize: 37, hiddenColumns: ["nope"] })
    )
    expect(preferences.loadTable()).toEqual({ pageSize: 25, hiddenColumns: [] })
  })

  it("remembers the workspace tab and the briefing", () => {
    preferences.saveWorkspace("analytics")
    expect(preferences.loadWorkspace()).toBe("analytics")

    preferences.saveIntroSeen(true)
    expect(preferences.loadIntroSeen()).toBe(true)
  })

  it("bounds the acknowledged-alert list so it cannot grow forever", () => {
    const ids = Array.from({ length: 500 }, (_, index) => `alert-${index}`)
    preferences.saveAcknowledgedAlerts(ids)

    const restored = preferences.loadAcknowledgedAlerts()
    expect(restored).toHaveLength(200)
    expect(restored[restored.length - 1]).toBe("alert-499")
  })
})
