"use client"

import { useCallback, useMemo } from "react"
import type { DeliveryPerformance } from "@/lib/calculations"
import { minutesToBreach } from "@/lib/calculations"
import { simulationEngine } from "@/services/simulation"
import { operationsNow } from "@/services/simulation/ops-clock"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type {
  Customer,
  Delivery,
  DeliveryCounts,
  DeliveryStatusFilter,
  Driver,
  Route,
  Vehicle,
} from "@/types"

export interface DeliveryDetail {
  readonly delivery: Delivery
  readonly customer: Customer | null
  readonly driver: Driver | null
  readonly vehicle: Vehicle | null
  readonly route: Route | null
  readonly minutesToBreach: number
}

export interface UseDeliveriesResult {
  readonly counts: DeliveryCounts
  readonly performance: DeliveryPerformance
  readonly statusFilter: DeliveryStatusFilter
  readonly selectedDelivery: DeliveryDetail | null
  setStatusFilter(status: DeliveryStatusFilter): void
  selectDelivery(deliveryId: string): void
  clearSelection(): void
  getDetail(deliveryId: string): DeliveryDetail | null
  completeDelivery(deliveryId: string): void
  cancelDelivery(deliveryId: string): void
}

/**
 * Delivery domain state: the aggregates, the current selection and the
 * lifecycle commands.
 *
 * Everything here is cheap — counts and performance are maintained by the
 * store on commit, and a detail record is composed only for the one open
 * delivery. The expensive table projection lives in `useDeliveryBoard`, which
 * is mounted only alongside the board itself.
 */
export function useDeliveries(): UseDeliveriesResult {
  const byId = useDeliveryStore((state) => state.byId)
  const counts = useDeliveryStore((state) => state.counts)
  const performance = useDeliveryStore((state) => state.performance)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const routesById = useReferenceStore((state) => state.routesById)
  const driversById = useReferenceStore((state) => state.driversById)
  const customersById = useReferenceStore((state) => state.customersById)

  const statusFilter = useUiStore((state) => state.filters.deliveryStatus)
  const selection = useUiStore((state) => state.selection)
  const setStatusFilter = useUiStore((state) => state.setDeliveryStatusFilter)
  const selectDelivery = useUiStore((state) => state.selectDelivery)
  const clearSelection = useUiStore((state) => state.clearSelection)

  const getDetail = useCallback(
    (deliveryId: string): DeliveryDetail | null => {
      const delivery = byId[deliveryId]
      if (!delivery) {
        return null
      }
      return {
        delivery,
        customer: customersById[delivery.customerId] ?? null,
        driver: delivery.driverId ? (driversById[delivery.driverId] ?? null) : null,
        vehicle: delivery.vehicleId
          ? (vehiclesById[delivery.vehicleId] ?? null)
          : null,
        route: routesById[delivery.routeId] ?? null,
        minutesToBreach: minutesToBreach(delivery, operationsNow()),
      }
    },
    [byId, customersById, driversById, vehiclesById, routesById]
  )

  const selectedDeliveryId =
    selection?.kind === "delivery" ? selection.id : null

  const selectedDelivery = useMemo(
    () => (selectedDeliveryId ? getDetail(selectedDeliveryId) : null),
    [selectedDeliveryId, getDetail]
  )

  return {
    counts,
    performance,
    statusFilter,
    selectedDelivery,
    setStatusFilter,
    selectDelivery,
    clearSelection,
    getDetail,
    completeDelivery: (deliveryId) => {
      simulationEngine.completeDeliveryNow(deliveryId)
    },
    cancelDelivery: (deliveryId) => {
      simulationEngine.cancelDeliveryNow(deliveryId, "Cancelled by dispatcher")
    },
  }
}
