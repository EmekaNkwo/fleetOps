"use client"

import { useCallback, useMemo, useState } from "react"
import { flattenResults, searchOperations, totalResults } from "@/lib/search"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type { SearchResult, SearchResultGroup } from "@/types"
import { useDebouncedValue } from "./use-debounced-value"

export interface UseSearchResult {
  readonly query: string
  readonly debouncedQuery: string
  readonly groups: readonly SearchResultGroup[]
  readonly results: readonly SearchResult[]
  readonly total: number
  readonly isSearching: boolean
  readonly isEmpty: boolean
  setQuery(query: string): void
  clear(): void
  /** Opens the right panel for a result and focuses the map when relevant. */
  open(result: SearchResult): void
}

/**
 * Global search.
 *
 * Debounced, because a keystroke would otherwise scan every vehicle, driver,
 * delivery, customer and route — roughly 1,700 records. The index itself is
 * memoised against store commits rather than rebuilt per render.
 */
export function useSearch(initialQuery = ""): UseSearchResult {
  const [query, setQueryState] = useState(initialQuery)
  const debouncedQuery = useDebouncedValue(query, 180)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const vehicleIds = useVehicleStore((state) => state.ids)
  const vehicleVersion = useVehicleStore((state) => state.version)
  const deliveriesById = useDeliveryStore((state) => state.byId)
  const deliveryIds = useDeliveryStore((state) => state.ids)
  const deliveryVersion = useDeliveryStore((state) => state.version)
  const drivers = useReferenceStore((state) => state.drivers)
  const customers = useReferenceStore((state) => state.customers)
  const routes = useReferenceStore((state) => state.routes)

  const focusVehicleOnMap = useUiStore((state) => state.focusVehicleOnMap)
  const selectDelivery = useUiStore((state) => state.selectDelivery)
  const selectDriver = useUiStore((state) => state.selectDriver)
  const setFilterQuery = useUiStore((state) => state.setQuery)
  const setWorkspace = useUiStore((state) => state.setWorkspace)
  const setSearchOpen = useUiStore((state) => state.setSearchOpen)
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen
  )

  const index = useMemo(() => {
    const driverNameById: Record<string, string> = {}
    for (const driver of drivers) {
      driverNameById[driver.id] = driver.name
    }
    const customerNameById: Record<string, string> = {}
    for (const customer of customers) {
      customerNameById[customer.id] = customer.name
    }

    return {
      vehicles: vehicleIds
        .map((id) => vehiclesById[id])
        .filter((vehicle) => vehicle !== undefined),
      deliveries: deliveryIds
        .map((id) => deliveriesById[id])
        .filter((delivery) => delivery !== undefined),
      drivers,
      customers,
      routes,
      driverNameById,
      customerNameById,
    }
  }, [
    vehicleIds,
    vehiclesById,
    vehicleVersion,
    deliveryIds,
    deliveriesById,
    deliveryVersion,
    drivers,
    customers,
    routes,
  ])

  const groups = useMemo(
    () => searchOperations(debouncedQuery, index),
    [debouncedQuery, index]
  )

  const open = useCallback(
    (result: SearchResult): void => {
      setSearchOpen(false)
      setCommandPaletteOpen(false)

      switch (result.kind) {
        case "vehicle":
          setWorkspace("map")
          focusVehicleOnMap(result.id)
          break
        case "delivery":
          selectDelivery(result.id)
          break
        case "driver":
          selectDriver(result.id)
          break
        case "customer": {
          const customer = customers.find((entry) => entry.id === result.id)
          if (customer) {
            setFilterQuery(customer.name)
            setWorkspace("deliveries")
          }
          break
        }
        case "route": {
          const route = routes.find((entry) => entry.id === result.id)
          if (route) {
            setFilterQuery(route.name)
            setWorkspace("deliveries")
          }
          break
        }
      }
    },
    [
      customers,
      focusVehicleOnMap,
      routes,
      selectDelivery,
      setCommandPaletteOpen,
      selectDriver,
      setFilterQuery,
      setSearchOpen,
      setWorkspace,
    ]
  )

  const total = totalResults(groups)

  return {
    query,
    debouncedQuery,
    groups,
    results: flattenResults(groups),
    total,
    isSearching: query.trim().length > 0 && query !== debouncedQuery,
    isEmpty: debouncedQuery.trim().length > 0 && total === 0,
    setQuery: setQueryState,
    clear: () => {
      setQueryState("")
    },
    open,
  }
}
