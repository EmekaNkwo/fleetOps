"use client"

import { useCallback, useMemo } from "react"
import { isActiveDeliveryStatus } from "@/lib/calculations"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type { Delivery, Driver, Route, Vehicle } from "@/types"

export interface DriverDetail {
  readonly driver: Driver
  /** The vehicle they are signed on to, if any. */
  readonly vehicle: Vehicle | null
  readonly delivery: Delivery | null
  readonly route: Route | null
  /** Everything currently assigned to them, newest first. */
  readonly activeDeliveries: readonly Delivery[]
}

export interface UseDriversResult {
  readonly selectedDriver: DriverDetail | null
  select(driverId: string): void
  clearSelection(): void
  getDetail(driverId: string): DriverDetail | null
}

/**
 * Driver records.
 *
 * Drivers were searchable but had nowhere to go — a search hit filtered the
 * delivery board by their name instead of showing the person. This resolves a
 * driver to the vehicle they are on, the delivery it carries and the rest of
 * their workload, so the roster is a real entity rather than a search string.
 */
export function useDrivers(): UseDriversResult {
  const driversById = useReferenceStore((state) => state.driversById)
  const routesById = useReferenceStore((state) => state.routesById)
  const vehiclesById = useVehicleStore((state) => state.byId)
  const vehicleIds = useVehicleStore((state) => state.ids)
  const vehicleVersion = useVehicleStore((state) => state.version)
  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)

  const selection = useUiStore((state) => state.selection)
  const select = useUiStore((state) => state.selectDriver)
  const clearSelection = useUiStore((state) => state.clearSelection)

  const selectedDriverId = selection?.kind === "driver" ? selection.id : null

  /**
   * Built only for the driver on screen. Indexing the whole roster by driver
   * would mean walking 520 vehicles and 680 deliveries on every commit to
   * support a panel that shows one person at a time.
   */
  const getDetail = useCallback(
    (driverId: string): DriverDetail | null => {
      const driver = driversById[driverId]
      if (!driver) {
        return null
      }

      const vehicleId = vehicleIds.find(
        (id) => vehiclesById[id]?.driverId === driverId
      )
      const vehicle = vehicleId ? (vehiclesById[vehicleId] ?? null) : null
      const delivery = vehicle?.deliveryId
        ? (deliveriesById[vehicle.deliveryId] ?? null)
        : null

      const activeDeliveries = deliveryIds
        .map((id) => deliveriesById[id])
        .filter(
          (entry): entry is Delivery =>
            entry !== undefined &&
            entry.driverId === driverId &&
            isActiveDeliveryStatus(entry.status)
        )

      return {
        driver,
        vehicle,
        delivery,
        route: delivery ? (routesById[delivery.routeId] ?? null) : null,
        activeDeliveries,
      }
    },
    [driversById, vehicleIds, vehiclesById, deliveryIds, deliveriesById, routesById]
  )

  const selectedDriver = useMemo(
    () => (selectedDriverId ? getDetail(selectedDriverId) : null),
    // `getDetail` closes over the store maps, so the version markers keep the
    // open panel live as the simulation runs.
    [selectedDriverId, getDetail, vehicleVersion, deliveryVersion]
  )

  return { selectedDriver, select, clearSelection, getDetail }
}
