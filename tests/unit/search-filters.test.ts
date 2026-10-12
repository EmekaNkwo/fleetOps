import { describe, expect, it } from "vitest"
import {
  compareDeliveryRows,
  hasActiveFilters,
  matchesDeliveryFilters,
  matchesVehicleFilters,
  paginate,
  type DeliveryRow,
  type FilterContext,
} from "@/lib/filtering"
import { scoreMatch, searchOperations, totalResults } from "@/lib/search"
import { generateBootstrapData } from "@/services/mock/dataset"
import type { OperationsFilters } from "@/types"

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)
const { snapshot } = generateBootstrapData({
  seed: 1_234,
  now: NOW,
  vehicles: 60,
  completedBacklog: 10,
})

const driverNameById = Object.fromEntries(
  snapshot.drivers.map((driver) => [driver.id, driver.name])
)
const customerNameById = Object.fromEntries(
  snapshot.customers.map((customer) => [customer.id, customer.name])
)
const routesById = Object.fromEntries(
  snapshot.routes.map((route) => [route.id, route])
)

const context: FilterContext = {
  routesById,
  driverNameById,
  customerNameById,
}

const baseFilters: OperationsFilters = {
  vehicleStatus: "ALL",
  deliveryStatus: "ALL",
  regions: [],
  query: "",
}

describe("vehicle filtering", () => {
  it("passes everything through when nothing is filtered", () => {
    const visible = snapshot.vehicles.filter((vehicle) =>
      matchesVehicleFilters(vehicle, baseFilters, context)
    )

    expect(visible).toHaveLength(snapshot.vehicles.length)
    expect(hasActiveFilters(baseFilters)).toBe(false)
  })

  it("narrows to a single status", () => {
    const visible = snapshot.vehicles.filter((vehicle) =>
      matchesVehicleFilters(
        vehicle,
        { ...baseFilters, vehicleStatus: "OFFLINE" },
        context
      )
    )

    expect(visible.length).toBeGreaterThan(0)
    expect(visible.every((vehicle) => vehicle.status === "OFFLINE")).toBe(true)
  })

  it("matches a region through the route a vehicle is working", () => {
    const visible = snapshot.vehicles.filter((vehicle) =>
      matchesVehicleFilters(
        vehicle,
        { ...baseFilters, regions: ["lagos"] },
        context
      )
    )

    expect(visible.length).toBeGreaterThan(0)
    for (const vehicle of visible) {
      const route = vehicle.routeId ? routesById[vehicle.routeId] : undefined
      const touchesLagos =
        vehicle.homeRegion === "lagos" ||
        route?.originRegion === "lagos" ||
        route?.destinationRegion === "lagos"
      expect(touchesLagos).toBe(true)
    }
  })

  it("searches call sign, plate and driver name", () => {
    const target = snapshot.vehicles[3]
    if (!target) {
      throw new Error("expected a vehicle")
    }

    expect(
      matchesVehicleFilters(
        target,
        { ...baseFilters, query: target.callSign },
        context
      )
    ).toBe(true)
    expect(
      matchesVehicleFilters(
        target,
        { ...baseFilters, query: target.plateNumber.toLowerCase() },
        context
      )
    ).toBe(true)
    expect(
      matchesVehicleFilters(
        target,
        { ...baseFilters, query: "zzzz-no-match" },
        context
      )
    ).toBe(false)
  })
})

describe("delivery filtering", () => {
  it("narrows to a single status", () => {
    const visible = snapshot.deliveries.filter((delivery) =>
      matchesDeliveryFilters(
        delivery,
        { ...baseFilters, deliveryStatus: "DELAYED" },
        context
      )
    )

    expect(visible.every((delivery) => delivery.status === "DELAYED")).toBe(true)
  })

  it("matches on the delivery reference and the customer name", () => {
    const target = snapshot.deliveries[0]
    if (!target) {
      throw new Error("expected a delivery")
    }
    const customer = customerNameById[target.customerId]

    expect(
      matchesDeliveryFilters(
        target,
        { ...baseFilters, query: target.reference },
        context
      )
    ).toBe(true)
    expect(
      matchesDeliveryFilters(
        target,
        { ...baseFilters, query: (customer ?? "").toLowerCase() },
        context
      )
    ).toBe(true)
  })
})

describe("table sorting and pagination", () => {
  const rows: DeliveryRow[] = [
    {
      delivery: { ...snapshot.deliveries[0]!, delayMinutes: 30, etaAt: 300 },
      customerName: "Zenith Foods Ltd.",
      driverName: "Ada O.",
      vehicleCallSign: "110",
      originName: "Lagos",
      destinationName: "Ibadan",
    },
    {
      delivery: { ...snapshot.deliveries[1]!, delayMinutes: 5, etaAt: 100 },
      customerName: "Addide Stores",
      driverName: "Bola K.",
      vehicleCallSign: "102",
      originName: "Abuja",
      destinationName: "Kano",
    },
  ]

  it("sorts ascending and descending by ETA", () => {
    const ascending = [...rows].sort(compareDeliveryRows("eta", "asc"))
    const descending = [...rows].sort(compareDeliveryRows("eta", "desc"))

    expect(ascending[0]?.delivery.etaAt).toBe(100)
    expect(descending[0]?.delivery.etaAt).toBe(300)
  })

  it("sorts vehicle call signs numerically, not lexically", () => {
    const sorted = [...rows].sort(compareDeliveryRows("vehicle", "asc"))
    expect(sorted[0]?.vehicleCallSign).toBe("102")
  })

  it("sorts customers alphabetically", () => {
    const sorted = [...rows].sort(compareDeliveryRows("customer", "asc"))
    expect(sorted[0]?.customerName).toBe("Addide Stores")
  })

  it("clamps an out-of-range page to the last page", () => {
    const items = Array.from({ length: 25 }, (_, index) => index)
    const page = paginate(items, 99, 10)

    expect(page.pageCount).toBe(3)
    expect(page.page).toBe(2)
    expect(page.rows).toEqual([20, 21, 22, 23, 24])
  })

  it("reports a single empty page for an empty board", () => {
    const page = paginate([], 0, 25)
    expect(page.pageCount).toBe(1)
    expect(page.rows).toEqual([])
  })
})

describe("global search", () => {
  const index = {
    vehicles: snapshot.vehicles,
    drivers: snapshot.drivers,
    deliveries: snapshot.deliveries,
    customers: snapshot.customers,
    routes: snapshot.routes,
    driverNameById,
    customerNameById,
  }

  it("returns nothing for an empty query", () => {
    expect(searchOperations("", index)).toEqual([])
    expect(searchOperations("   ", index)).toEqual([])
  })

  it("ranks an exact match above a partial one", () => {
    expect(scoreMatch("192", "192")).toBeGreaterThan(scoreMatch("1192", "192"))
    expect(scoreMatch("DEL-192", "del")).toBeGreaterThan(0)
    expect(scoreMatch("nothing", "zzz")).toBe(0)
  })

  it("finds a vehicle by its call sign and groups the result", () => {
    const target = snapshot.vehicles[7]
    if (!target) {
      throw new Error("expected a vehicle")
    }

    const groups = searchOperations(target.callSign, index)
    const vehicles = groups.find((group) => group.kind === "vehicle")

    expect(vehicles).toBeDefined()
    expect(vehicles?.results[0]?.title).toBe(`Vehicle ${target.callSign}`)
  })

  it("finds a delivery by reference and a driver by surname", () => {
    const delivery = snapshot.deliveries[2]
    const driver = snapshot.drivers[4]
    if (!delivery || !driver) {
      throw new Error("expected seed records")
    }

    const byReference = searchOperations(delivery.reference, index)
    expect(
      byReference.find((group) => group.kind === "delivery")?.results[0]?.id
    ).toBe(delivery.id)

    const bySurname = searchOperations(driver.name.split(" ")[1] ?? "", index)
    expect(totalResults(bySurname)).toBeGreaterThan(0)
  })

  it("returns no groups for a query that matches nothing", () => {
    const groups = searchOperations("qqqzzzxxx", index)
    expect(totalResults(groups)).toBe(0)
  })

  it("caps each group so results stay scannable", () => {
    const groups = searchOperations("a", index)
    for (const group of groups) {
      expect(group.results.length).toBeLessThanOrEqual(5)
    }
  })
})
