import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import {
  useActivity,
  useAlertNotifications,
  useAlerts,
  useDeliveries,
  useDeliveryBoard,
  useDrivers,
  useFleet,
  useIncidents,
  useMap,
  useMetrics,
  useSearch,
} from "@/hooks"
import { generateBootstrapData } from "@/services/mock/dataset"
import { applySnapshot } from "@/stores/event-wiring"
import {
  useActivityStore,
  useAlertStore,
  useReferenceStore,
  useUiStore,
} from "@/stores"

/**
 * The hooks layer is the whole business-logic surface the UI consumes, and the
 * architecture claims it can be exercised without rendering the application.
 * These tests are that claim, checked.
 */

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

function seed() {
  const { snapshot } = generateBootstrapData({
    seed: 7_777,
    now: NOW,
    vehicles: 80,
    completedBacklog: 20,
  })
  applySnapshot(snapshot)
  return snapshot
}

beforeEach(() => {
  useUiStore.setState({
    selection: null,
    panel: null,
    filters: {
      vehicleStatus: "ALL",
      deliveryStatus: "ALL",
      regions: [],
      query: "",
    },
    alertSeverityFilter: "ALL",
  })
  useUiStore.getState().setTablePage(0)
  seed()
})

describe("useFleet", () => {
  it("exposes the whole fleet and its counts", () => {
    const { result } = renderHook(() => useFleet())

    expect(result.current.vehicles.length).toBe(80)
    expect(result.current.counts.total).toBe(80)
    // `matchingVehicles` is the whole filtered set; `visibleVehicles` is the
    // page of it the rail is currently showing.
    expect(result.current.matchingVehicles.length).toBe(80)
    expect(result.current.visibleVehicles.length).toBe(result.current.pageSize)
    expect(result.current.isFiltered).toBe(false)
  })

  it("narrows the fleet when a status filter is applied", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setStatusFilter("OFFLINE")
    })

    expect(result.current.statusFilter).toBe("OFFLINE")
    expect(result.current.matchingVehicles.length).toBeLessThan(80)
    expect(
      result.current.matchingVehicles.every((v) => v.status === "OFFLINE")
    ).toBe(true)
    expect(result.current.isFiltered).toBe(true)
  })

  it("composes a full detail record for the selected vehicle", () => {
    const { result } = renderHook(() => useFleet())
    const working = result.current.vehicles.find(
      (vehicle) => vehicle.deliveryId !== null
    )
    if (!working) {
      throw new Error("expected a vehicle with a delivery")
    }

    act(() => {
      result.current.selectVehicle(working.id)
    })

    const detail = result.current.selectedVehicle
    expect(detail?.vehicle.id).toBe(working.id)
    expect(detail?.driver).not.toBeNull()
    expect(detail?.route).not.toBeNull()
    expect(detail?.delivery).not.toBeNull()
    expect(detail?.progress?.fraction).toBeGreaterThanOrEqual(0)
  })

  it("clears the selection", () => {
    const { result } = renderHook(() => useFleet())
    const id = result.current.vehicles[0]?.id
    if (!id) {
      throw new Error("expected a vehicle")
    }

    act(() => {
      result.current.selectVehicle(id)
    })
    expect(result.current.selectedVehicle).not.toBeNull()

    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedVehicle).toBeNull()
  })

  it("asks the map to focus a vehicle and selects it in the same gesture", () => {
    const { result } = renderHook(() => useFleet())
    const id = result.current.vehicles[2]?.id
    if (!id) {
      throw new Error("expected a vehicle")
    }

    act(() => {
      result.current.focusOnMap(id)
    })

    expect(useUiStore.getState().mapFocus?.vehicleId).toBe(id)
    expect(result.current.selectedVehicleId).toBe(id)
  })

  it("reports counts per status for the filter chips", () => {
    const { result } = renderHook(() => useFleet())

    expect(result.current.countByStatus("ON_ROUTE")).toBe(
      result.current.counts.onRoute
    )
    expect(result.current.countByStatus("OFFLINE")).toBe(
      result.current.counts.offline
    )
  })
})

describe("useDeliveries", () => {
  it("exposes board aggregates without projecting the table", () => {
    const { result } = renderHook(() => useDeliveries())

    expect(result.current.counts.total).toBeGreaterThan(0)
    expect(result.current.performance.onTimeRate).toBeGreaterThan(0)
  })

  it("filters the board by status", () => {
    const { result } = renderHook(() => useDeliveries())

    act(() => {
      result.current.setStatusFilter("COMPLETED")
    })

    expect(result.current.statusFilter).toBe("COMPLETED")
  })

  it("composes a detail record for the open delivery", () => {
    const board = renderHook(() => useDeliveryBoard())
    const id = board.result.current.rows[0]?.delivery.id
    if (!id) {
      throw new Error("expected a row")
    }

    const { result } = renderHook(() => useDeliveries())
    act(() => {
      result.current.selectDelivery(id)
    })

    expect(result.current.selectedDelivery?.delivery.id).toBe(id)
    expect(result.current.selectedDelivery?.customer).not.toBeNull()
    expect(result.current.selectedDelivery?.route).not.toBeNull()
  })
})

describe("useDeliveryBoard", () => {
  it("projects the board into table rows with resolved names", () => {
    const { result } = renderHook(() => useDeliveryBoard())

    expect(result.current.rows.length).toBeGreaterThan(0)
    const row = result.current.rows[0]
    expect(row?.customerName).not.toBe("")
    expect(row?.originName).not.toBe("—")
  })

  it("paginates and clamps the page to the available range", () => {
    const { result } = renderHook(() => useDeliveryBoard())

    expect(result.current.visibleRows.length).toBeLessThanOrEqual(
      result.current.pageSize
    )

    act(() => {
      result.current.setPage(999)
    })
    expect(result.current.page).toBe(result.current.pageCount - 1)
  })

  it("sorts by a column and flips direction on a second request", () => {
    const { result } = renderHook(() => useDeliveryBoard())

    act(() => {
      result.current.sortByColumn("delay")
    })
    expect(result.current.sortBy).toBe("delay")
    expect(result.current.sortDirection).toBe("asc")

    const ascending = result.current.rows.map(
      (row) => row.delivery.delayMinutes
    )
    expect([...ascending].sort((a, b) => a - b)).toEqual(ascending)

    act(() => {
      result.current.sortByColumn("delay")
    })
    expect(result.current.sortDirection).toBe("desc")
  })

  it("honours the status filter shared with the rest of the console", () => {
    const deliveries = renderHook(() => useDeliveries())
    const { result } = renderHook(() => useDeliveryBoard())

    act(() => {
      deliveries.result.current.setStatusFilter("COMPLETED")
    })

    expect(
      result.current.rows.every((row) => row.delivery.status === "COMPLETED")
    ).toBe(true)
  })

  it("selects rows without opening them", () => {
    const { result } = renderHook(() => useDeliveryBoard())
    const id = result.current.rows[0]?.delivery.id
    if (!id) {
      throw new Error("expected a row")
    }

    act(() => {
      result.current.toggleRow(id)
    })
    expect(result.current.selectedIds).toContain(id)

    act(() => {
      result.current.clearRows()
    })
    expect(result.current.selectedIds).toHaveLength(0)
  })

  it("hides and restores a column", () => {
    const { result } = renderHook(() => useDeliveryBoard())

    act(() => {
      result.current.toggleColumn("driver")
    })
    expect(result.current.hiddenColumns).toContain("driver")

    act(() => {
      result.current.toggleColumn("driver")
    })
    expect(result.current.hiddenColumns).not.toContain("driver")
  })

  it("changes page size and returns to the first page", () => {
    const { result } = renderHook(() => useDeliveryBoard())

    act(() => {
      result.current.setPage(1)
    })
    act(() => {
      result.current.setPageSize(50)
    })

    expect(result.current.pageSize).toBe(50)
    expect(result.current.page).toBe(0)
  })
})

describe("useAlerts", () => {
  it("counts open alerts by severity", () => {
    const { result } = renderHook(() => useAlerts())

    const total =
      result.current.countsBySeverity.CRITICAL +
      result.current.countsBySeverity.WARNING +
      result.current.countsBySeverity.INFO

    expect(result.current.alerts.length).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(0)
  })

  it("filters the queue by severity", () => {
    const { result } = renderHook(() => useAlerts())

    act(() => {
      result.current.setSeverityFilter("CRITICAL")
    })

    expect(
      result.current.visibleAlerts.every((a) => a.severity === "CRITICAL")
    ).toBe(true)
  })

  it("hides dismissed alerts from the visible queue", () => {
    const { result } = renderHook(() => useAlerts())

    expect(
      result.current.visibleAlerts.every((a) => a.status !== "DISMISSED")
    ).toBe(true)
  })

  it("opens the vehicle an alert is about", () => {
    const { result } = renderHook(() => useAlerts())
    const withVehicle = result.current.alerts.find(
      (alert) => alert.vehicleId !== null && alert.incidentId === null
    )
    if (!withVehicle) {
      throw new Error("expected a vehicle alert")
    }

    act(() => {
      result.current.inspect(withVehicle)
    })

    expect(useUiStore.getState().selection).toEqual({
      kind: "vehicle",
      id: withVehicle.vehicleId,
    })
  })

  it("opens the incident panel for an alert tied to an incident", () => {
    const { result } = renderHook(() => useAlerts())
    const withIncident = result.current.alerts.find(
      (alert) => alert.incidentId !== null
    )

    if (!withIncident) {
      return
    }

    act(() => {
      result.current.inspect(withIncident)
    })

    expect(useUiStore.getState().panel).toBe("incidents")
  })
})

describe("useIncidents", () => {
  it("separates open incidents from resolved ones", () => {
    const { result } = renderHook(() => useIncidents())

    expect(result.current.incidents.length).toBeGreaterThan(0)
    expect(
      result.current.openIncidents.every((i) => i.status !== "RESOLVED")
    ).toBe(true)
    expect(result.current.openCount).toBe(result.current.openIncidents.length)
  })

  it("offers only the transitions the lifecycle permits", () => {
    const { result } = renderHook(() => useIncidents())
    const detected = result.current.incidents.find(
      (incident) => incident.status === "DETECTED"
    )
    if (!detected) {
      throw new Error("expected a freshly detected incident")
    }

    act(() => {
      result.current.select(detected.id)
    })

    const allowed = result.current.selectedIncident?.allowedTransitions ?? []
    expect(allowed).toContain("ACKNOWLEDGED")
    expect(allowed).not.toContain("INVESTIGATING")
  })

  it("exposes the dispatcher roster for assignment", () => {
    const { result } = renderHook(() => useIncidents())
    expect(result.current.assignees.length).toBeGreaterThan(0)
  })
})

describe("useMetrics", () => {
  it("builds the eight headline KPIs", () => {
    const { result } = renderHook(() => useMetrics())

    expect(result.current.kpis).toHaveLength(8)
    expect(result.current.kpis.map((kpi) => kpi.label)).toEqual([
      "Active Deliveries",
      "In Transit",
      "Delivered Today",
      "Delayed",
      "At Risk",
      "Vehicles Online",
      "Vehicles Offline",
      "ETA Accuracy",
    ])
  })

  it("reports metrics consistent with the stores", () => {
    const { result: metrics } = renderHook(() => useMetrics())
    const { result: fleet } = renderHook(() => useFleet())

    expect(metrics.current.metrics.vehiclesOnline).toBe(fleet.current.counts.online)
    expect(metrics.current.metrics.fleetAvailability).toBeGreaterThan(0)
    expect(metrics.current.metrics.fleetAvailability).toBeLessThanOrEqual(1)
  })

  it("marks a rise in delays as bad and a rise in completions as good", () => {
    const { result } = renderHook(() => useMetrics())

    const delayed = result.current.kpis.find((kpi) => kpi.id === "delayed")
    const delivered = result.current.kpis.find((kpi) => kpi.id === "delivered")

    expect(delayed?.trend?.polarity).toBeDefined()
    expect(delivered?.trend?.polarity).toBeDefined()
  })

  it("only makes status KPIs drillable", () => {
    const { result } = renderHook(() => useMetrics())

    expect(
      result.current.kpis.find((kpi) => kpi.id === "delayed")?.drilldown
    ).toBe("DELAYED")
    expect(
      result.current.kpis.find((kpi) => kpi.id === "online")?.drilldown
    ).toBeUndefined()
  })
})

describe("useSearch", () => {
  it("returns nothing until a query is entered", () => {
    const { result } = renderHook(() => useSearch())

    expect(result.current.groups).toEqual([])
    expect(result.current.total).toBe(0)
    expect(result.current.isEmpty).toBe(false)
  })

  it("finds a vehicle after the debounce settles", async () => {
    const { result } = renderHook(() => useFleet())
    const callSign = result.current.vehicles[5]?.callSign
    if (!callSign) {
      throw new Error("expected a vehicle")
    }

    const search = renderHook(() => useSearch())
    act(() => {
      search.result.current.setQuery(callSign)
    })

    await waitFor(() => {
      expect(search.result.current.total).toBeGreaterThan(0)
    })
    expect(
      search.result.current.groups.some((group) => group.kind === "vehicle")
    ).toBe(true)
  })

  it("reports an empty result rather than silently showing nothing", async () => {
    const { result } = renderHook(() => useSearch())

    act(() => {
      result.current.setQuery("zzz-not-a-thing")
    })

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true)
    })
  })

  it("clears the query", async () => {
    const { result } = renderHook(() => useSearch())

    act(() => {
      result.current.setQuery("lagos")
    })
    await waitFor(() => {
      expect(result.current.total).toBeGreaterThan(0)
    })

    act(() => {
      result.current.clear()
    })
    expect(result.current.query).toBe("")
  })

  it("routes a vehicle result to the map", async () => {
    const fleet = renderHook(() => useFleet())
    const vehicleId = fleet.result.current.vehicles[1]?.id
    const callSign = fleet.result.current.vehicles[1]?.callSign
    if (!vehicleId || !callSign) {
      throw new Error("expected a vehicle")
    }

    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.setQuery(callSign)
    })
    await waitFor(() => {
      expect(result.current.total).toBeGreaterThan(0)
    })

    const hit = result.current.results.find(
      (entry) => entry.kind === "vehicle" && entry.id === vehicleId
    )
    if (!hit) {
      throw new Error("expected the vehicle in the results")
    }

    act(() => {
      result.current.open(hit)
    })

    expect(useUiStore.getState().workspace).toBe("map")
    expect(useUiStore.getState().mapFocus?.vehicleId).toBe(vehicleId)
  })
})

describe("useActivity", () => {
  it("filters the feed by severity", () => {
    useActivityStore.getState().replaceAll([
      {
        id: "1",
        at: NOW,
        type: "x",
        severity: "CRITICAL",
        message: "critical",
        vehicleId: null,
        deliveryId: null,
      },
      {
        id: "2",
        at: NOW,
        type: "y",
        severity: "INFO",
        message: "info",
        vehicleId: null,
        deliveryId: null,
      },
    ])

    const { result } = renderHook(() => useActivity())
    expect(result.current.events).toHaveLength(2)

    act(() => {
      result.current.setSeverityFilter("CRITICAL")
    })
    expect(result.current.events).toHaveLength(1)
  })

  it("freezes the feed while it is held", () => {
    useActivityStore.getState().replaceAll([
      {
        id: "1",
        at: NOW,
        type: "x",
        severity: "INFO",
        message: "first",
        vehicleId: null,
        deliveryId: null,
      },
    ])

    const { result } = renderHook(() => useActivity())
    act(() => {
      result.current.setPaused(true)
    })

    act(() => {
      useActivityStore.getState().append([
        {
          id: "2",
          at: NOW,
          type: "y",
          severity: "INFO",
          message: "arrived while held",
          vehicleId: null,
          deliveryId: null,
        },
      ])
    })

    expect(result.current.events).toHaveLength(1)

    act(() => {
      result.current.setPaused(false)
    })
    expect(result.current.events).toHaveLength(2)
  })

  it("opens the delivery a feed line refers to", () => {
    useActivityStore.getState().replaceAll([
      {
        id: "1",
        at: NOW,
        type: "delivery.delayed",
        severity: "WARNING",
        message: "delayed",
        vehicleId: null,
        deliveryId: "del-28001",
      },
    ])

    const { result } = renderHook(() => useActivity())
    const event = result.current.events[0]
    if (!event) {
      throw new Error("expected a feed line")
    }

    act(() => {
      result.current.open(event)
    })

    expect(useUiStore.getState().selection).toEqual({
      kind: "delivery",
      id: "del-28001",
    })
  })
})

describe("useDrivers", () => {
  it("resolves a driver to their vehicle, delivery and workload", () => {
    const fleet = renderHook(() => useFleet())
    const working = fleet.result.current.vehicles.find(
      (vehicle) => vehicle.deliveryId !== null
    )
    if (!working) {
      throw new Error("expected a vehicle carrying a delivery")
    }

    const { result } = renderHook(() => useDrivers())
    act(() => {
      result.current.select(working.driverId)
    })

    const detail = result.current.selectedDriver
    expect(detail?.driver.id).toBe(working.driverId)
    expect(detail?.vehicle?.id).toBe(working.id)
    expect(detail?.delivery).not.toBeNull()
    expect(detail?.route).not.toBeNull()
    expect(detail?.activeDeliveries.length).toBeGreaterThan(0)
  })

  it("handles a driver with nothing assigned", () => {
    const { result } = renderHook(() => useDrivers())
    const fleet = renderHook(() => useFleet())
    const assigned = new Set(
      fleet.result.current.vehicles.map((vehicle) => vehicle.driverId)
    )
    const idleDriverId = Object.keys(
      useReferenceStore.getState().driversById
    ).find((id) => !assigned.has(id))

    if (!idleDriverId) {
      return
    }

    act(() => {
      result.current.select(idleDriverId)
    })

    expect(result.current.selectedDriver?.vehicle).toBeNull()
    expect(result.current.selectedDriver?.activeDeliveries).toHaveLength(0)
  })

  it("returns nothing for an unknown driver", () => {
    const { result } = renderHook(() => useDrivers())
    expect(result.current.getDetail("driver-does-not-exist")).toBeNull()
  })

  it("clears the selection", () => {
    const { result } = renderHook(() => useDrivers())

    act(() => {
      result.current.select("driver-0")
    })
    expect(result.current.selectedDriver).not.toBeNull()

    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedDriver).toBeNull()
  })
})

describe("useDeliveryBoard bulk actions", () => {
  it("selects and clears a whole page", () => {
    const { result } = renderHook(() => useDeliveryBoard())
    const pageSize = result.current.visibleRows.length
    expect(pageSize).toBeGreaterThan(0)

    act(() => {
      result.current.togglePageSelection()
    })
    expect(result.current.selectedIds).toHaveLength(pageSize)
    expect(result.current.pageFullySelected).toBe(true)

    act(() => {
      result.current.togglePageSelection()
    })
    expect(result.current.selectedIds).toHaveLength(0)
    expect(result.current.pageFullySelected).toBe(false)
  })

  it("counts only live deliveries as actionable", () => {
    const deliveries = renderHook(() => useDeliveries())
    act(() => {
      deliveries.result.current.setStatusFilter("COMPLETED")
    })

    const { result } = renderHook(() => useDeliveryBoard())
    act(() => {
      result.current.togglePageSelection()
    })

    // A page of closed deliveries offers nothing to act on.
    expect(result.current.selectedIds.length).toBeGreaterThan(0)
    expect(result.current.actionableIds).toHaveLength(0)
  })

  it("completes every actionable row in the selection", () => {
    const deliveries = renderHook(() => useDeliveries())
    act(() => {
      deliveries.result.current.setStatusFilter("IN_TRANSIT")
    })

    const { result } = renderHook(() => useDeliveryBoard())
    act(() => {
      result.current.togglePageSelection()
    })
    const targeted = result.current.actionableIds.length
    expect(targeted).toBeGreaterThan(0)

    act(() => {
      result.current.completeSelected()
    })

    // The selection is released once the command has been issued.
    expect(result.current.selectedIds).toHaveLength(0)
  })
})

describe("useMap route highlight", () => {
  it("highlights the corridor of the selected vehicle", () => {
    const fleet = renderHook(() => useFleet())
    const working = fleet.result.current.vehicles.find(
      (vehicle) => vehicle.routeId !== null
    )
    if (!working) {
      throw new Error("expected a vehicle on a route")
    }

    const { result } = renderHook(() => useMap())
    expect(result.current.highlightedRoute).toBeNull()

    act(() => {
      result.current.selectVehicle(working.id)
    })

    expect(result.current.highlightedRoute?.routeId).toBe(working.routeId)
    expect(result.current.highlightedRoute?.points.length).toBeGreaterThan(1)
  })

  it("highlights the corridor of the selected delivery", () => {
    const board = renderHook(() => useDeliveryBoard())
    const row = board.result.current.rows[0]
    if (!row) {
      throw new Error("expected a row")
    }

    const deliveries = renderHook(() => useDeliveries())
    const { result } = renderHook(() => useMap())

    act(() => {
      deliveries.result.current.selectDelivery(row.delivery.id)
    })

    expect(result.current.highlightedRoute?.routeId).toBe(row.delivery.routeId)
  })

  it("drops the highlight when nothing is selected", () => {
    const { result } = renderHook(() => useMap())

    act(() => {
      result.current.selectVehicle("vehicle-0")
    })
    act(() => {
      result.current.clearSelection()
    })

    expect(result.current.highlightedRoute).toBeNull()
  })
})

describe("useAlertNotifications", () => {
  it("is off until the operator opts in, and persists the choice", () => {
    const { result } = renderHook(() => useAlertNotifications())

    expect(result.current.preferences.sound).toBe(false)
    expect(result.current.preferences.desktop).toBe(false)

    act(() => {
      result.current.setSound(true)
    })

    expect(result.current.preferences.sound).toBe(true)
    expect(window.localStorage.getItem("fleetops:notifications")).toContain(
      '"sound":true'
    )
  })

  it("never announces alerts that were already on the board", () => {
    // Nothing should fire on first observation, however many criticals exist.
    const { result } = renderHook(() => useAlertNotifications())
    act(() => {
      result.current.setSound(true)
    })

    expect(useAlertStore.getState().latestCriticalId).not.toBeNull()
    expect(result.current.preferences.sound).toBe(true)
  })
})

describe("useFleet pagination", () => {
  it("serves one page at a time out of the matching set", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(10)
    })

    expect(result.current.matchingVehicles).toHaveLength(80)
    expect(result.current.visibleVehicles).toHaveLength(10)
    expect(result.current.pageCount).toBe(8)
    expect(result.current.rangeStart).toBe(1)
    expect(result.current.rangeEnd).toBe(10)
  })

  it("advances through pages without repeating a vehicle", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(10)
    })
    const first = result.current.visibleVehicles.map((v) => v.id)

    act(() => {
      result.current.setPage(1)
    })
    const second = result.current.visibleVehicles.map((v) => v.id)

    expect(result.current.rangeStart).toBe(11)
    expect(result.current.rangeEnd).toBe(20)
    expect(second.some((id) => first.includes(id))).toBe(false)
  })

  it("clamps a page beyond the end of the set", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(25)
    })
    act(() => {
      result.current.setPage(999)
    })

    expect(result.current.page).toBe(result.current.pageCount - 1)
    expect(result.current.visibleVehicles.length).toBeGreaterThan(0)
  })

  it("returns to the first page when the fleet is filtered", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(10)
    })
    act(() => {
      result.current.setPage(3)
    })
    expect(result.current.page).toBe(3)

    act(() => {
      result.current.setStatusFilter("ON_ROUTE")
    })

    expect(result.current.page).toBe(0)
    expect(
      result.current.matchingVehicles.every((v) => v.status === "ON_ROUTE")
    ).toBe(true)
  })

  it("persists the page size but never the page", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(50)
    })

    expect(window.localStorage.getItem("fleetops:fleet")).toContain('"pageSize":50')
    expect(result.current.page).toBe(0)
  })

  it("jumps to the page holding a vehicle selected elsewhere", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(10)
    })

    // Something on the last page — as if chosen from the map or a search hit.
    const target = result.current.matchingVehicles[73]
    if (!target) {
      throw new Error("expected a vehicle deep in the list")
    }

    act(() => {
      result.current.selectVehicle(target.id)
    })

    expect(result.current.page).toBe(7)
    expect(
      result.current.visibleVehicles.some((v) => v.id === target.id)
    ).toBe(true)
  })

  it("does not drag the view back when the operator pages away by hand", () => {
    const { result } = renderHook(() => useFleet())

    act(() => {
      result.current.setPageSize(10)
    })
    const target = result.current.matchingVehicles[5]
    if (!target) {
      throw new Error("expected a vehicle")
    }

    act(() => {
      result.current.selectVehicle(target.id)
    })
    act(() => {
      result.current.setPage(4)
    })

    // The selection has not changed, so the reveal must not fire again.
    expect(result.current.page).toBe(4)
  })
})
