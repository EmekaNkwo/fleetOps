"use client"

import { useMemo } from "react"
import { REGION_BY_ID } from "@/data/geography"
import { isActiveDeliveryStatus, startOfDay } from "@/lib/calculations"
import { paginate } from "@/lib/filtering"
import { operationsNow } from "@/services/simulation/ops-clock"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type {
  Driver,
  DriverColumnId,
  DriverStatusFilter,
  SortDirection,
  VehicleStatus,
} from "@/types"

export interface DriverRosterRow {
  readonly driver: Driver
  readonly regionName: string
  readonly vehicleId: string | null
  readonly vehicleCallSign: string
  readonly vehicleStatus: VehicleStatus | null
  /** Live deliveries assigned to this driver right now. */
  readonly activeCount: number
  /** Of those, how many are running late or at risk of it. */
  readonly delayedCount: number
  readonly completedToday: number
  /** Worst delay across their live work, in minutes. Drives the row tone. */
  readonly worstDelayMinutes: number
}

export interface UseDriverRosterResult {
  readonly rows: readonly DriverRosterRow[]
  readonly visibleRows: readonly DriverRosterRow[]
  readonly totalRows: number
  readonly rosterSize: number
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly rangeStart: number
  readonly rangeEnd: number
  readonly sortBy: DriverColumnId
  readonly sortDirection: SortDirection
  readonly statusFilter: DriverStatusFilter
  readonly selectedDriverId: string | null
  /** Headline counts for the strip above the table. */
  readonly summary: {
    readonly onDuty: number
    readonly unreachable: number
    readonly carryingDelays: number
    readonly idle: number
  }
  sortByColumn(column: DriverColumnId): void
  setPage(page: number): void
  setPageSize(size: number): void
  setStatusFilter(status: DriverStatusFilter): void
  select(driverId: string): void
}

const PAGE_SIZES: readonly number[] = [10, 25, 50]

/** A delivery counts as "carrying delay" past this much slippage. */
const DELAY_THRESHOLD_MINUTES = 5

function compareRows(
  column: DriverColumnId,
  direction: SortDirection
): (a: DriverRosterRow, b: DriverRosterRow) => number {
  const sign = direction === "asc" ? 1 : -1

  return (a, b) => {
    switch (column) {
      case "status":
        return sign * a.driver.status.localeCompare(b.driver.status)
      case "region":
        return sign * a.regionName.localeCompare(b.regionName)
      case "vehicle":
        return (
          sign *
          a.vehicleCallSign.localeCompare(b.vehicleCallSign, undefined, {
            numeric: true,
          })
        )
      case "active":
        // Ties break on delay so the busiest-and-latest sort to the top, which
        // is the order a dispatcher actually wants to work down.
        return (
          sign * (a.activeCount - b.activeCount) ||
          sign * (a.worstDelayMinutes - b.worstDelayMinutes)
        )
      case "delayed":
        return (
          sign * (a.delayedCount - b.delayedCount) ||
          sign * (a.worstDelayMinutes - b.worstDelayMinutes)
        )
      case "completed":
        return sign * (a.completedToday - b.completedToday)
      case "rating":
        return sign * (a.driver.rating - b.driver.rating)
      case "name":
      default:
        return sign * a.driver.name.localeCompare(b.driver.name)
    }
  }
}

/**
 * The roster projection: who is on duty, what they are carrying, and how badly
 * it is going.
 *
 * Built here rather than in `useDrivers` for the same reason the delivery board
 * was split out — it walks every vehicle and every delivery to index work by
 * driver, and that is only worth doing while the roster tab is on screen.
 *
 * Region and free-text filters come from the shared operations filters, so
 * narrowing to Lagos narrows the roster too. Driver status is the roster's own
 * filter: it has no meaning anywhere else in the console.
 */
export function useDriverRoster(): UseDriverRosterResult {
  const drivers = useReferenceStore((state) => state.drivers)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const vehicleIds = useVehicleStore((state) => state.ids)
  const vehicleVersion = useVehicleStore((state) => state.version)

  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)

  const filters = useUiStore((state) => state.filters)
  const selection = useUiStore((state) => state.selection)
  const selectDriver = useUiStore((state) => state.selectDriver)

  const view = useWorkspaceStore((state) => state.roster)
  const statusFilter = useWorkspaceStore((state) => state.driverStatus)
  const sortByColumn = useWorkspaceStore((state) => state.sortRoster)
  const setPage = useWorkspaceStore((state) => state.setRosterPage)
  const setPageSize = useWorkspaceStore((state) => state.setRosterPageSize)
  const setStatusFilter = useWorkspaceStore((state) => state.setDriverStatus)

  const allRows = useMemo<readonly DriverRosterRow[]>(() => {
    const dayStart = startOfDay(operationsNow())

    const vehicleByDriver = new Map<string, (typeof vehiclesById)[string]>()
    for (const id of vehicleIds) {
      const vehicle = vehiclesById[id]
      if (vehicle) {
        vehicleByDriver.set(vehicle.driverId, vehicle)
      }
    }

    interface Work {
      active: number
      delayed: number
      completed: number
      worstDelay: number
    }
    const workByDriver = new Map<string, Work>()
    const workFor = (driverId: string): Work => {
      const existing = workByDriver.get(driverId)
      if (existing) {
        return existing
      }
      const created: Work = { active: 0, delayed: 0, completed: 0, worstDelay: 0 }
      workByDriver.set(driverId, created)
      return created
    }

    for (const id of deliveryIds) {
      const delivery = deliveriesById[id]
      if (!delivery?.driverId) {
        continue
      }
      const work = workFor(delivery.driverId)

      if (isActiveDeliveryStatus(delivery.status)) {
        work.active += 1
        if (delivery.delayMinutes >= DELAY_THRESHOLD_MINUTES) {
          work.delayed += 1
        }
        work.worstDelay = Math.max(work.worstDelay, delivery.delayMinutes)
      } else if (
        delivery.status === "COMPLETED" &&
        delivery.completedAt !== null &&
        delivery.completedAt >= dayStart
      ) {
        work.completed += 1
      }
    }

    return drivers.map((driver) => {
      const vehicle = vehicleByDriver.get(driver.id) ?? null
      const work = workByDriver.get(driver.id)

      return {
        driver,
        regionName: REGION_BY_ID[driver.homeRegion]?.name ?? driver.homeRegion,
        vehicleId: vehicle?.id ?? null,
        vehicleCallSign: vehicle?.callSign ?? "—",
        vehicleStatus: vehicle?.status ?? null,
        activeCount: work?.active ?? 0,
        delayedCount: work?.delayed ?? 0,
        completedToday: work?.completed ?? 0,
        worstDelayMinutes: work?.worstDelay ?? 0,
      }
    })
  }, [
    drivers,
    vehicleIds,
    vehiclesById,
    vehicleVersion,
    deliveryIds,
    deliveriesById,
    deliveryVersion,
  ])

  const rows = useMemo(() => {
    const query = filters.query.trim().toLowerCase()

    const filtered = allRows.filter((row) => {
      if (statusFilter !== "ALL" && row.driver.status !== statusFilter) {
        return false
      }
      if (
        filters.regions.length > 0 &&
        !filters.regions.includes(row.driver.homeRegion)
      ) {
        return false
      }
      if (query.length === 0) {
        return true
      }
      return (
        row.driver.name.toLowerCase().includes(query) ||
        row.vehicleCallSign.toLowerCase().includes(query) ||
        row.regionName.toLowerCase().includes(query)
      )
    })

    return [...filtered].sort(compareRows(view.sortBy, view.sortDirection))
  }, [allRows, filters.regions, filters.query, statusFilter, view.sortBy, view.sortDirection])

  const pageState = useMemo(
    () => paginate(rows, view.page, view.pageSize),
    [rows, view.page, view.pageSize]
  )

  const summary = useMemo(() => {
    let onDuty = 0
    let unreachable = 0
    let carryingDelays = 0
    let idle = 0

    for (const row of allRows) {
      if (row.driver.status === "ON_DUTY") {
        onDuty += 1
      }
      if (row.driver.status === "UNREACHABLE") {
        unreachable += 1
      }
      if (row.delayedCount > 0) {
        carryingDelays += 1
      }
      if (row.driver.status === "ON_DUTY" && row.activeCount === 0) {
        idle += 1
      }
    }

    return { onDuty, unreachable, carryingDelays, idle }
  }, [allRows])

  const rangeStart = pageState.rows.length === 0 ? 0 : pageState.page * view.pageSize + 1

  return {
    rows,
    visibleRows: pageState.rows,
    totalRows: rows.length,
    rosterSize: allRows.length,
    page: pageState.page,
    pageCount: pageState.pageCount,
    pageSize: view.pageSize,
    rangeStart,
    rangeEnd: rangeStart === 0 ? 0 : rangeStart + pageState.rows.length - 1,
    sortBy: view.sortBy,
    sortDirection: view.sortDirection,
    statusFilter,
    selectedDriverId: selection?.kind === "driver" ? selection.id : null,
    summary,
    sortByColumn,
    setPage,
    setPageSize,
    setStatusFilter,
    select: selectDriver,
  }
}

export { PAGE_SIZES as DRIVER_PAGE_SIZES }
