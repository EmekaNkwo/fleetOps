"use client"

import { useMemo } from "react"
import { REGION_BY_ID } from "@/data/geography"
import { alertThresholds } from "@/services/simulation/thresholds"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type { Vehicle } from "@/types"

export type FuelRisk = "critical" | "low" | "watch"

export interface FuelRow {
  readonly vehicle: Vehicle
  readonly driverName: string
  readonly regionName: string
  readonly routeName: string | null
  readonly risk: FuelRisk
  /**
   * Whether the tank covers the rest of the current run. Null when the vehicle
   * is not carrying anything, where the question does not arise.
   */
  readonly completesRun: boolean | null
  readonly remainingKm: number
  /** Rough range left in the tank, in km. */
  readonly rangeKm: number
}

export interface UseFuelResult {
  readonly rows: readonly FuelRow[]
  readonly criticalCount: number
  readonly strandedCount: number
  readonly threshold: number
  select(vehicleId: string): void
}

/**
 * Kilometres a full tank is worth.
 *
 * The simulation burns fuel as a percentage of distance scaled by payload
 * capacity, so there is no litres-per-100km anywhere to read. This constant is
 * the inverse of that burn at a mid-sized vehicle, which is enough to answer
 * the only question the worklist asks: will this truck finish its run.
 */
const RANGE_PER_FULL_TANK_KM = 900

/** Tanks above the alert line but close enough to plan around. */
const WATCH_MULTIPLIER = 2

/**
 * The refuelling worklist.
 *
 * Fuel has been modelled since the first tick — burned per kilometre, alerted
 * on when it crosses the line — but it only ever surfaced one vehicle at a
 * time on its own card. The operational question is not "how full is vehicle
 * 192", it is "who will not make it to the end of their run", and that needs
 * the fleet ranked against the work each vehicle is carrying.
 */
export function useFuel(): UseFuelResult {
  const byId = useVehicleStore((state) => state.byId)
  const ids = useVehicleStore((state) => state.ids)
  const version = useVehicleStore((state) => state.version)

  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryVersion = useDeliveryStore((state) => state.version)
  const routesById = useReferenceStore((state) => state.routesById)
  const driversById = useReferenceStore((state) => state.driversById)

  const selectVehicle = useUiStore((state) => state.focusVehicleOnMap)

  const rows = useMemo<readonly FuelRow[]>(() => {
    const limit = alertThresholds().lowFuelPercent
    const watchLimit = Math.min(100, limit * WATCH_MULTIPLIER)
    const result: FuelRow[] = []

    for (const id of ids) {
      const vehicle = byId[id]
      if (!vehicle || vehicle.fuelLevel > watchLimit) {
        continue
      }

      const delivery = vehicle.deliveryId
        ? deliveriesById[vehicle.deliveryId]
        : undefined
      const remainingKm = delivery?.remainingKm ?? 0
      const rangeKm = (vehicle.fuelLevel / 100) * RANGE_PER_FULL_TANK_KM

      result.push({
        vehicle,
        driverName: driversById[vehicle.driverId]?.shortName ?? "Unassigned",
        regionName:
          REGION_BY_ID[vehicle.homeRegion]?.name ?? vehicle.homeRegion,
        routeName: vehicle.routeId
          ? (routesById[vehicle.routeId]?.name ?? null)
          : null,
        risk:
          vehicle.fuelLevel <= limit / 2
            ? "critical"
            : vehicle.fuelLevel <= limit
              ? "low"
              : "watch",
        completesRun: delivery ? rangeKm >= remainingKm : null,
        remainingKm,
        rangeKm,
      })
    }

    // Worst first, and within a tier the vehicle that will strand soonest.
    result.sort((a, b) => {
      const aStrands = a.completesRun === false ? 0 : 1
      const bStrands = b.completesRun === false ? 0 : 1
      return aStrands - bStrands || a.vehicle.fuelLevel - b.vehicle.fuelLevel
    })

    return result
  }, [
    ids,
    byId,
    version,
    deliveriesById,
    deliveryVersion,
    routesById,
    driversById,
  ])

  const criticalCount = rows.filter((row) => row.risk === "critical").length
  const strandedCount = rows.filter((row) => row.completesRun === false).length

  return {
    rows,
    criticalCount,
    strandedCount,
    threshold: alertThresholds().lowFuelPercent,
    select: selectVehicle,
  }
}
