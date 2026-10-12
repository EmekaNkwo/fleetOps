import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ActivityFeed } from "@/components/activity/activity-feed"
import { AlertItem } from "@/components/alerts/alert-item"
import { DeliveryTable } from "@/components/deliveries/delivery-table"
import { DeliveryTimeline } from "@/components/deliveries/delivery-timeline"
import { MetricsGrid } from "@/components/dashboard/metrics-grid"
import { VehicleList } from "@/components/vehicles/vehicle-list"
import { VehicleStatusFilterGroup } from "@/components/dashboard/filter-controls"
import {
  BootstrapError,
  BootstrapLoading,
} from "@/components/shell/bootstrap-screen"
import { Spinner } from "@/components/shared/spinner"
import type { DeliveryRow } from "@/lib/filtering"
import type { ActivityEvent, Alert, Delivery, TimelineEntry, Vehicle } from "@/types"
import type { KpiDefinition } from "@/hooks"

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "vehicle-1",
    callSign: "192",
    type: "Mercedes Sprinter",
    plateNumber: "LAG-482-KJ",
    driverId: "driver-1",
    status: "ON_ROUTE",
    location: { lat: 6.5, lng: 3.4 },
    speed: 74,
    heading: 45,
    routeId: "lag-iba",
    deliveryId: "del-1",
    homeRegion: "lagos",
    fuelLevel: 64,
    mileageKm: 182_000,
    lastMaintenance: NOW,
    capacityKg: 1_200,
    lastSeen: NOW,
    ...overrides,
  }
}

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: "del-1",
    reference: "DEL-28492",
    status: "IN_TRANSIT",
    priority: "STANDARD",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    driverId: "driver-1",
    routeId: "lag-iba",
    originRegion: "lagos",
    destinationRegion: "ibadan",
    weightKg: 900,
    createdAt: NOW,
    startedAt: NOW,
    completedAt: null,
    promisedAt: NOW,
    etaAt: NOW,
    originalEtaAt: NOW,
    delayMinutes: 0,
    progressFraction: 0.4,
    remainingKm: 83,
    timeline: [],
    ...overrides,
  }
}

function row(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    delivery: delivery(),
    customerName: "ABC Foods Ltd.",
    driverName: "Chukwuemeka N.",
    vehicleCallSign: "192",
    originName: "Apapa Port",
    destinationName: "Ibadan Challenge",
    ...overrides,
  }
}

const fleetListBase = {
  emptyHint: "none",
  page: 0,
  pageCount: 1,
  pageSize: 25,
  pageSizes: [10, 25, 50],
  rangeStart: 1,
  rangeEnd: 1,
  totalCount: 1,
  onSelect: vi.fn(),
  onPage: vi.fn(),
  onPageSize: vi.fn(),
}

describe("VehicleList", () => {
  it("renders the fleet and reports the selected row to assistive tech", async () => {
    render(
      <div style={{ height: 400 }}>
        <VehicleList
          {...fleetListBase}
          vehicles={[vehicle(), vehicle({ id: "vehicle-2", callSign: "193" })]}
          selectedVehicleId="vehicle-2"
          totalCount={2}
          rangeEnd={2}
        />
      </div>
    )

    const list = await screen.findByRole("listbox", { name: "Fleet" })
    expect(await within(list).findByText("192")).toBeInTheDocument()
    expect(
      within(list).getByRole("option", { selected: true })
    ).toHaveAttribute("id", "vehicle-option-vehicle-2")
  })

  it("calls back with the vehicle id when a row is chosen", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ height: 400 }}>
        <VehicleList
          {...fleetListBase}
          vehicles={[vehicle()]}
          selectedVehicleId={null}
          onSelect={onSelect}
        />
      </div>
    )

    const list = screen.getByRole("listbox", { name: "Fleet" })
    await user.click(within(list).getByRole("option"))
    expect(onSelect).toHaveBeenCalledWith("vehicle-1")
  })

  it("is selectable with the keyboard", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ height: 400 }}>
        <VehicleList
          {...fleetListBase}
          vehicles={[vehicle()]}
          selectedVehicleId={null}
          onSelect={onSelect}
        />
      </div>
    )

    const list = screen.getByRole("listbox", { name: "Fleet" })
    within(list).getByRole("option").focus()
    await user.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledWith("vehicle-1")
  })

  it("explains how to recover when the filters hide everything", () => {
    render(
      <VehicleList
        {...fleetListBase}
        vehicles={[]}
        selectedVehicleId={null}
        emptyHint="Loosen the status filter."
        totalCount={0}
        rangeStart={0}
        rangeEnd={0}
      />
    )

    expect(screen.getByText("No vehicles match")).toBeInTheDocument()
    expect(screen.getByText("Loosen the status filter.")).toBeInTheDocument()
  })
})

describe("status filters", () => {
  it("marks the active status as pressed and toggles it off again", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <VehicleStatusFilterGroup
        value="OFFLINE"
        countFor={() => 4}
        total={520}
        onChange={onChange}
      />
    )

    const offline = screen.getByRole("button", { name: /Offline/ })
    expect(offline).toHaveAttribute("aria-pressed", "true")

    await user.click(offline)
    expect(onChange).toHaveBeenCalledWith("ALL")
  })
})

describe("MetricsGrid", () => {
  const kpis: readonly KpiDefinition[] = [
    {
      id: "delayed",
      label: "Delayed",
      value: 18,
      display: "18",
      drilldown: "DELAYED",
      trend: { direction: "up", delta: 4, polarity: "bad", since: "since 10:00" },
    },
    {
      id: "online",
      label: "Vehicles Online",
      value: 516,
      display: "516",
      trend: null,
    },
  ]

  it("shows the value and the direction of travel", () => {
    render(
      <MetricsGrid kpis={kpis} activeStatus="ALL" onDrilldown={vi.fn()} />
    )

    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.getByText("+4")).toBeInTheDocument()
    expect(screen.getByText("since 10:00")).toBeInTheDocument()
  })

  it("drills into the matching status, and back out when pressed again", async () => {
    const onDrilldown = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <MetricsGrid kpis={kpis} activeStatus="ALL" onDrilldown={onDrilldown} />
    )
    await user.click(screen.getByRole("button", { name: /Delayed/ }))
    expect(onDrilldown).toHaveBeenCalledWith("DELAYED")

    rerender(
      <MetricsGrid
        kpis={kpis}
        activeStatus="DELAYED"
        onDrilldown={onDrilldown}
      />
    )
    await user.click(screen.getByRole("button", { name: /Delayed/ }))
    expect(onDrilldown).toHaveBeenLastCalledWith("ALL")
  })

  it("leaves non-drillable metrics non-interactive", () => {
    render(
      <MetricsGrid kpis={kpis} activeStatus="ALL" onDrilldown={vi.fn()} />
    )

    expect(
      screen.queryByRole("button", { name: /Vehicles Online/ })
    ).not.toBeInTheDocument()
  })
})

describe("DeliveryTable", () => {
  const baseProps = {
    totalRows: 1,
    page: 0,
    pageCount: 1,
    pageSize: 25,
    sortBy: "eta" as const,
    sortDirection: "asc" as const,
    hiddenColumns: [],
    selectedIds: [],
    pageFullySelected: false,
    columnMenuOpen: false,
    onSort: vi.fn(),
    onPage: vi.fn(),
    onPageSize: vi.fn(),
    onToggleColumn: vi.fn(),
    onToggleColumnMenu: vi.fn(),
    onToggleRow: vi.fn(),
    onTogglePageSelection: vi.fn(),
    onOpenRow: vi.fn(),
    onClearFilters: vi.fn(),
  }

  it("renders a row with its customer, driver and status", () => {
    render(<DeliveryTable {...baseProps} rows={[row()]} />)

    expect(screen.getByText("#DEL-28492")).toBeInTheDocument()
    expect(screen.getByText("ABC Foods Ltd.")).toBeInTheDocument()
    expect(screen.getByText("Chukwuemeka N.")).toBeInTheDocument()
    expect(screen.getByText("In Transit")).toBeInTheDocument()
  })

  it("exposes the sorted column to assistive technology", () => {
    render(<DeliveryTable {...baseProps} rows={[row()]} />)

    expect(screen.getByRole("columnheader", { name: /ETA/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )
  })

  it("requests a sort when a header is activated", async () => {
    const onSort = vi.fn()
    const user = userEvent.setup()

    render(<DeliveryTable {...baseProps} rows={[row()]} onSort={onSort} />)
    await user.click(screen.getByRole("button", { name: /Customer/ }))

    expect(onSort).toHaveBeenCalledWith("customer")
  })

  it("opens a delivery when its row is clicked", async () => {
    const onOpenRow = vi.fn()
    const user = userEvent.setup()

    render(<DeliveryTable {...baseProps} rows={[row()]} onOpenRow={onOpenRow} />)
    await user.click(screen.getByText("ABC Foods Ltd."))

    expect(onOpenRow).toHaveBeenCalledWith("del-1")
  })

  it("selects a row without opening it", async () => {
    const onOpenRow = vi.fn()
    const onToggleRow = vi.fn()
    const user = userEvent.setup()

    render(
      <DeliveryTable
        {...baseProps}
        rows={[row()]}
        onOpenRow={onOpenRow}
        onToggleRow={onToggleRow}
      />
    )
    await user.click(
      screen.getByRole("checkbox", { name: /Select delivery DEL-28492/ })
    )

    expect(onToggleRow).toHaveBeenCalledWith("del-1")
    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it("hides a column when it is switched off", () => {
    render(
      <DeliveryTable {...baseProps} rows={[row()]} hiddenColumns={["customer"]} />
    )

    expect(screen.queryByText("ABC Foods Ltd.")).not.toBeInTheDocument()
    expect(screen.getByText("#DEL-28492")).toBeInTheDocument()
  })

  it("offers a way out when every delivery is filtered away", async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()

    render(
      <DeliveryTable
        {...baseProps}
        rows={[]}
        totalRows={0}
        onClearFilters={onClearFilters}
      />
    )

    expect(
      screen.getByText("No deliveries match the current view")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(onClearFilters).toHaveBeenCalled()
  })

  it("disables paging controls at the ends of the board", () => {
    render(<DeliveryTable {...baseProps} rows={[row()]} />)

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })
})

describe("DeliveryTimeline", () => {
  const entries: readonly TimelineEntry[] = [
    {
      id: "1",
      kind: "pickup",
      label: "Pickup confirmed",
      at: NOW,
      state: "done",
    },
    {
      id: "2",
      kind: "traffic",
      label: "Traffic detected",
      detail: "Flooding after heavy rainfall",
      at: NOW,
      state: "done",
    },
    {
      id: "3",
      kind: "in_transit",
      label: "In transit",
      at: NOW,
      state: "active",
    },
    {
      id: "4",
      kind: "arrival",
      label: "Arrival at destination",
      at: NOW,
      state: "upcoming",
    },
  ]

  it("renders the journey in order with its detail text", () => {
    render(<DeliveryTimeline entries={entries} />)

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent("Pickup confirmed")
    expect(items[1]).toHaveTextContent("Flooding after heavy rainfall")
  })

  it("marks the current step for screen readers and flags the expected one", () => {
    render(<DeliveryTimeline entries={entries} />)

    expect(screen.getByText("Current step")).toBeInTheDocument()
    expect(screen.getByText(/exp\./)).toBeInTheDocument()
  })

  it("handles a delivery with no history yet", () => {
    render(<DeliveryTimeline entries={[]} />)
    expect(
      screen.getByText("No journey events recorded yet.")
    ).toBeInTheDocument()
  })
})

describe("AlertItem", () => {
  const alert: Alert = {
    id: "alert-1",
    kind: "VEHICLE_OFFLINE",
    severity: "CRITICAL",
    title: "Vehicle 102 offline",
    message: "No telemetry received for 2 minutes",
    status: "OPEN",
    createdAt: NOW - 120_000,
    updatedAt: NOW,
    vehicleId: "vehicle-1",
    deliveryId: null,
    incidentId: null,
    region: "lagos",
  }

  it("shows the alert with its age and severity code", () => {
    render(
      <AlertItem
        alert={alert}
        now={NOW}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onResolve={vi.fn()}
        onInspect={vi.fn()}
      />
    )

    expect(screen.getByText("Vehicle 102 offline")).toBeInTheDocument()
    expect(screen.getByText("2m ago")).toBeInTheDocument()
    expect(screen.getByText("CRT")).toBeInTheDocument()
  })

  it("acknowledges, resolves, dismisses and inspects", async () => {
    const onAcknowledge = vi.fn()
    const onResolve = vi.fn()
    const onDismiss = vi.fn()
    const onInspect = vi.fn()
    const user = userEvent.setup()

    render(
      <AlertItem
        alert={alert}
        now={NOW}
        onAcknowledge={onAcknowledge}
        onDismiss={onDismiss}
        onResolve={onResolve}
        onInspect={onInspect}
      />
    )

    await user.click(screen.getByRole("button", { name: /Acknowledge/ }))
    await user.click(screen.getByRole("button", { name: /^Resolve/ }))
    await user.click(screen.getByRole("button", { name: /^Dismiss/ }))
    await user.click(screen.getByRole("button", { name: /^Inspect/ }))

    expect(onAcknowledge).toHaveBeenCalledWith("alert-1")
    expect(onResolve).toHaveBeenCalledWith("alert-1")
    expect(onDismiss).toHaveBeenCalledWith("alert-1")
    expect(onInspect).toHaveBeenCalledWith(alert)
  })

  it("drops the acknowledge action once an alert is settled", () => {
    render(
      <AlertItem
        alert={{ ...alert, status: "RESOLVED" }}
        now={NOW}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onResolve={vi.fn()}
        onInspect={vi.fn()}
      />
    )

    expect(
      screen.queryByRole("button", { name: /Acknowledge/ })
    ).not.toBeInTheDocument()
  })
})

describe("ActivityFeed", () => {
  const events: readonly ActivityEvent[] = [
    {
      id: "a",
      at: NOW,
      type: "delivery.delayed",
      severity: "WARNING",
      message: "Delivery #DEL-28492 delayed by 21 min",
      vehicleId: null,
      deliveryId: "del-1",
    },
    {
      id: "b",
      at: NOW,
      type: "vehicle.online",
      severity: "INFO",
      message: "Vehicle 192 back online",
      vehicleId: "vehicle-1",
      deliveryId: null,
    },
  ]

  it("streams events newest first", async () => {
    render(
      <div style={{ height: 300 }}>
        <ActivityFeed
          events={events}
          total={2}
          paused={false}
          severityFilter="ALL"
          onSetPaused={vi.fn()}
          onSetSeverityFilter={vi.fn()}
          onSelect={vi.fn()}
        />
      </div>
    )

    expect(
      await screen.findByText("Delivery #DEL-28492 delayed by 21 min")
    ).toBeInTheDocument()
    expect(screen.getByText("2 total")).toBeInTheDocument()
  })

  it("opens the subject of a line when it is clicked", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ height: 300 }}>
        <ActivityFeed
          events={events}
          total={2}
          paused={false}
          severityFilter="ALL"
          onSetPaused={vi.fn()}
          onSetSeverityFilter={vi.fn()}
          onSelect={onSelect}
        />
      </div>
    )

    await user.click(await screen.findByText("Vehicle 192 back online"))
    expect(onSelect).toHaveBeenCalledWith(events[1])
  })

  it("can be held so a line can be read", async () => {
    const onSetPaused = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ height: 300 }}>
        <ActivityFeed
          events={events}
          total={2}
          paused={false}
          severityFilter="ALL"
          onSetPaused={onSetPaused}
          onSetSeverityFilter={vi.fn()}
          onSelect={vi.fn()}
        />
      </div>
    )

    await user.click(
      screen.getByRole("button", { name: "Hold activity feed" })
    )
    expect(onSetPaused).toHaveBeenCalledWith(true)
  })

  it("stops announcing updates while held", () => {
    render(
      <div style={{ height: 300 }}>
        <ActivityFeed
          events={events}
          total={2}
          paused
          severityFilter="ALL"
          onSetPaused={vi.fn()}
          onSetSeverityFilter={vi.fn()}
          onSelect={vi.fn()}
        />
      </div>
    )

    expect(
      screen.getByRole("log", { name: "Operational activity" })
    ).toHaveAttribute("aria-live", "off")
  })

  it("says so when there is nothing to show yet", () => {
    render(
      <ActivityFeed
        events={[]}
        total={0}
        paused={false}
        severityFilter="ALL"
        onSetPaused={vi.fn()}
        onSetSeverityFilter={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText("No activity yet")).toBeInTheDocument()
  })
})

describe("BootstrapLoading", () => {
  const progress = {
    fraction: 0.42,
    vehiclesLoaded: 240,
    vehiclesTotal: 520,
    deliveriesLoaded: 120,
    deliveriesTotal: 680,
    stage: "Loading fleet and delivery board",
  }

  it("reports a real fraction, not an indeterminate animation", () => {
    render(<BootstrapLoading progress={progress} />)

    const bar = screen.getByRole("progressbar", {
      name: "Loading operational data",
    })
    expect(bar).toHaveAttribute("aria-valuenow", "42")
    expect(screen.getByText("42%")).toBeInTheDocument()
  })

  it("shows how much of each collection has arrived", () => {
    render(<BootstrapLoading progress={progress} />)

    expect(screen.getByText("240")).toBeInTheDocument()
    expect(screen.getByText("/ 520")).toBeInTheDocument()
    expect(screen.getByText("120")).toBeInTheDocument()
    expect(screen.getByText("/ 680")).toBeInTheDocument()
  })

  it("names the stage and marks itself busy for assistive tech", () => {
    render(<BootstrapLoading progress={progress} />)

    expect(
      screen.getByText("Loading fleet and delivery board…")
    ).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
  })

  it("clamps a completed load to 100%", () => {
    render(
      <BootstrapLoading
        progress={{ ...progress, fraction: 1, stage: "Starting the engine" }}
      />
    )

    expect(
      screen.getByRole("progressbar", { name: "Loading operational data" })
    ).toHaveAttribute("aria-valuenow", "100")
  })
})

describe("BootstrapError", () => {
  it("explains the failure and offers a retry", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()

    render(<BootstrapError message="Gateway timed out" onRetry={onRetry} />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Gateway timed out")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Retry connection" }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe("Spinner", () => {
  it("announces itself when it carries a label", () => {
    render(<Spinner label="Loading deliveries" />)
    expect(
      screen.getByRole("status", { name: "Loading deliveries" })
    ).toBeInTheDocument()
  })

  it("is hidden from assistive tech when purely decorative", () => {
    const { container } = render(<Spinner label={null} />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true")
  })
})

describe("VehicleList pagination", () => {
  const page = Array.from({ length: 3 }, (_, index) =>
    vehicle({ id: `vehicle-${index}`, callSign: `20${index}` })
  )

  it("reports the visible range against the full filtered set", () => {
    render(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        page={1}
        pageCount={4}
        pageSize={3}
        rangeStart={4}
        rangeEnd={6}
        totalCount={12}
      />
    )

    expect(screen.getByText("4–6 of 12")).toBeInTheDocument()
  })

  it("only renders the page it was given", () => {
    render(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        totalCount={500}
        rangeEnd={3}
      />
    )

    const list = screen.getByRole("listbox", { name: "Fleet" })
    expect(within(list).getAllByRole("option")).toHaveLength(3)
  })

  it("pages forward and back", async () => {
    const onPage = vi.fn()
    const user = userEvent.setup()

    render(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        page={1}
        pageCount={4}
        totalCount={12}
        onPage={onPage}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Next page of vehicles" })
    )
    expect(onPage).toHaveBeenCalledWith(2)

    await user.click(
      screen.getByRole("button", { name: "Previous page of vehicles" })
    )
    expect(onPage).toHaveBeenCalledWith(0)
  })

  it("disables the controls at either end", () => {
    const { rerender } = render(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        page={0}
        pageCount={3}
        totalCount={9}
      />
    )
    expect(
      screen.getByRole("button", { name: "Previous page of vehicles" })
    ).toBeDisabled()

    rerender(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        page={2}
        pageCount={3}
        totalCount={9}
      />
    )
    expect(
      screen.getByRole("button", { name: "Next page of vehicles" })
    ).toBeDisabled()
  })

  it("changes the page size", async () => {
    const onPageSize = vi.fn()
    const user = userEvent.setup()

    render(
      <VehicleList
        {...fleetListBase}
        vehicles={page}
        selectedVehicleId={null}
        totalCount={500}
        onPageSize={onPageSize}
      />
    )

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Vehicles per page" }),
      "50"
    )
    expect(onPageSize).toHaveBeenCalledWith(50)
  })

  it("hides the pager entirely when nothing matches", () => {
    render(
      <VehicleList
        {...fleetListBase}
        vehicles={[]}
        selectedVehicleId={null}
        totalCount={0}
        rangeStart={0}
        rangeEnd={0}
      />
    )

    expect(screen.getByText("No vehicles match")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Next page of vehicles" })
    ).not.toBeInTheDocument()
  })
})
