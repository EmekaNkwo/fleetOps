"use client"

import { useEffect, useMemo, useRef } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { DATASET } from "@/data/config"
import {
  DEFAULT_PAGE_SIZE,
  operationsApi,
  type Page,
  type ReferencePayload,
  type OperationsPayload,
  type VehiclePageItem,
} from "@/services/mock/api"
import { simulationEngine } from "@/services/simulation"
import { applySnapshot, connectStores } from "@/stores/event-wiring"
import {
  hydrateUiStore,
  hydrateWorkspaceStore,
  useGeofenceStore,
  useSimulationStore,
} from "@/stores"
import type { Delivery, OperationsSnapshot } from "@/types"

export interface BootstrapProgress {
  /** 0–1 across every collection being loaded. */
  readonly fraction: number
  readonly vehiclesLoaded: number
  readonly vehiclesTotal: number
  readonly deliveriesLoaded: number
  readonly deliveriesTotal: number
  readonly stage: string
}

export interface BootstrapResult {
  readonly isLoading: boolean
  readonly isError: boolean
  readonly error: Error | null
  readonly isReady: boolean
  readonly progress: BootstrapProgress
  retry(): void
}

const QUERY_KEY = ["operations", DATASET.seed] as const

/**
 * Cold-start sequence.
 *
 *  1. fetch the reference payload — the road network, roster and the
 *     collection totals, so progress can be reported as a real fraction,
 *  2. page through vehicles and deliveries concurrently,
 *  3. fetch the operational overlay,
 *  4. assemble one snapshot, hand it to the stores, initialise the engine and
 *     subscribe the stores to the event bus.
 *
 * The stores are written **once**, when every page has landed. Streaming
 * partial collections into them would be easy and wrong: the KPI cards and the
 * fleet counters are aggregates, and an aggregate over half a dataset is not a
 * smaller truth, it is a false one. The operator sees a progress bar and then
 * a complete board, never a board that is quietly incorrect.
 */
export function useBootstrap(): BootstrapResult {
  const setPhase = useSimulationStore((state) => state.setPhase)
  const phase = useSimulationStore((state) => state.phase)
  const connectedRef = useRef(false)
  const disconnectRef = useRef<(() => void) | null>(null)

  const reference = useQuery<ReferencePayload, Error>({
    queryKey: [...QUERY_KEY, "reference"],
    queryFn: ({ signal }) => operationsApi.fetchReference({}, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  const ready = reference.isSuccess

  const vehicles = useInfiniteQuery<Page<VehiclePageItem>, Error>({
    queryKey: [...QUERY_KEY, "vehicles"],
    enabled: ready,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: ({ pageParam, signal }) =>
      operationsApi.fetchVehiclePage(
        { cursor: pageParam as number, limit: DEFAULT_PAGE_SIZE },
        {},
        signal
      ),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  const deliveries = useInfiniteQuery<Page<Delivery>, Error>({
    queryKey: [...QUERY_KEY, "deliveries"],
    enabled: ready,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: ({ pageParam, signal }) =>
      operationsApi.fetchDeliveryPage(
        { cursor: pageParam as number, limit: DEFAULT_PAGE_SIZE },
        {},
        signal
      ),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  const operations = useQuery<OperationsPayload, Error>({
    queryKey: [...QUERY_KEY, "operations"],
    enabled: ready,
    queryFn: ({ signal }) => operationsApi.fetchOperations({}, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  // Walk each collection to its end. `useInfiniteQuery` hands back one page at
  // a time; the bootstrap wants all of them, so it keeps asking.
  useEffect(() => {
    if (vehicles.hasNextPage && !vehicles.isFetchingNextPage) {
      void vehicles.fetchNextPage()
    }
  }, [vehicles.hasNextPage, vehicles.isFetchingNextPage, vehicles])

  useEffect(() => {
    if (deliveries.hasNextPage && !deliveries.isFetchingNextPage) {
      void deliveries.fetchNextPage()
    }
  }, [deliveries.hasNextPage, deliveries.isFetchingNextPage, deliveries])

  const vehiclesLoaded =
    vehicles.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0
  const deliveriesLoaded =
    deliveries.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0

  const vehiclesTotal = reference.data?.vehicleCount ?? DATASET.vehicles
  const deliveriesTotal = reference.data?.deliveryCount ?? DATASET.deliveries

  const complete =
    reference.isSuccess &&
    operations.isSuccess &&
    vehicles.isSuccess &&
    deliveries.isSuccess &&
    !vehicles.hasNextPage &&
    !deliveries.hasNextPage

  const firstError =
    reference.error ?? vehicles.error ?? deliveries.error ?? operations.error ?? null

  const progress = useMemo<BootstrapProgress>(() => {
    const expected = vehiclesTotal + deliveriesTotal
    const loaded = vehiclesLoaded + deliveriesLoaded
    // The reference and operational payloads are weighted as a tenth each, so
    // the bar does not sit at zero through the opening handshake.
    const collections = expected === 0 ? 0 : loaded / expected
    const fraction =
      (reference.isSuccess ? 0.1 : 0) +
      collections * 0.8 +
      (operations.isSuccess ? 0.1 : 0)

    const stage = !reference.isSuccess
      ? "Connecting to the operations gateway"
      : !complete
        ? "Loading fleet and delivery board"
        : "Starting the operations engine"

    return {
      fraction: Math.min(1, fraction),
      vehiclesLoaded,
      vehiclesTotal,
      deliveriesLoaded,
      deliveriesTotal,
      stage,
    }
  }, [
    complete,
    deliveriesLoaded,
    deliveriesTotal,
    operations.isSuccess,
    reference.isSuccess,
    vehiclesLoaded,
    vehiclesTotal,
  ])

  useEffect(() => {
    if (firstError) {
      setPhase("error", firstError.message)
      return
    }
    if (!complete) {
      setPhase("loading")
      return
    }
    if (connectedRef.current) {
      return
    }

    const referenceData = reference.data
    const operationsData = operations.data
    if (!referenceData || !operationsData) {
      return
    }

    const vehiclePages = vehicles.data?.pages ?? []
    const deliveryPages = deliveries.data?.pages ?? []
    const vehicleItems = vehiclePages.flatMap((page) => page.items)

    const snapshot: OperationsSnapshot = {
      generatedAt: referenceData.generatedAt,
      routes: referenceData.routes,
      drivers: referenceData.drivers,
      customers: referenceData.customers,
      traffic: referenceData.traffic,
      vehicles: vehicleItems.map((item) => item.vehicle),
      deliveries: deliveryPages.flatMap((page) => page.items),
      incidents: operationsData.incidents,
      alerts: operationsData.alerts,
      activity: operationsData.activity,
    }

    connectedRef.current = true
    hydrateUiStore()
    hydrateWorkspaceStore()
    applySnapshot(snapshot)
    simulationEngine.initialise({
      snapshot,
      kinematics: vehicleItems.map((item) => item.kinematics),
      counters: { ...referenceData.counters },
      options: operationsApi.generationOptions(),
    })
    // Zones are pushed into the engine only once it has a world to evaluate
    // them against, which is why this follows `initialise` rather than sitting
    // with the other preference hydration above.
    useGeofenceStore.getState().hydrate()
    disconnectRef.current = connectStores()
    setPhase("ready")
  }, [
    complete,
    firstError,
    reference.data,
    operations.data,
    vehicles.data,
    deliveries.data,
    setPhase,
  ])

  useEffect(
    () => () => {
      disconnectRef.current?.()
      disconnectRef.current = null
    },
    []
  )

  return {
    isLoading: !complete && !firstError,
    isError: Boolean(firstError),
    error: firstError,
    isReady: phase === "ready",
    progress,
    retry: () => {
      void reference.refetch()
      void operations.refetch()
      void vehicles.refetch()
      void deliveries.refetch()
    },
  }
}
