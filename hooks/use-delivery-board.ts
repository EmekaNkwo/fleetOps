"use client"

import { useCallback, useMemo } from "react"
import { isActiveDeliveryStatus } from "@/lib/calculations"
import { simulationEngine } from "@/services/simulation"
import { useActionJournal } from "@/stores/action-journal"
import { notify } from "@/stores/toast-store"
import {
  compareDeliveryRows,
  matchesDeliveryFilters,
  paginate,
  type DeliveryRow,
} from "@/lib/filtering"
import {
  useDeliveryStore,
  useReferenceStore,
  useUiStore,
  useVehicleStore,
} from "@/stores"
import type { DeliveryColumnId, SortDirection } from "@/types"
import { useFilterContext } from "./use-fleet"

export interface UseDeliveryBoardResult {
  readonly rows: readonly DeliveryRow[]
  readonly visibleRows: readonly DeliveryRow[]
  readonly totalRows: number
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly sortBy: DeliveryColumnId
  readonly sortDirection: SortDirection
  readonly hiddenColumns: readonly DeliveryColumnId[]
  readonly selectedIds: readonly string[]
  sortByColumn(column: DeliveryColumnId): void
  setPage(page: number): void
  setPageSize(size: number): void
  toggleColumn(column: DeliveryColumnId): void
  toggleRow(deliveryId: string): void
  /** Selects, or clears, every row on the current page. */
  togglePageSelection(): void
  clearRows(): void
  /** Ids in the selection that can still be acted on. */
  readonly actionableIds: readonly string[]
  readonly pageFullySelected: boolean
  completeSelected(): void
  cancelSelected(): void
}

/**
 * The delivery table projection: filter, join, sort, paginate.
 *
 * This is deliberately split out of `useDeliveries`. It is the single most
 * expensive derivation in the app — it walks ~680 deliveries, joins four
 * lookup tables and sorts the result — and it has to re-run on every store
 * commit. Keeping it in the orchestration hook meant that work happened eight
 * times a second whether or not the board was on screen. It now lives with the
 * component that renders it, which is only mounted on the deliveries tab.
 */
export function useDeliveryBoard(): UseDeliveryBoardResult {
  const byId = useDeliveryStore((state) => state.byId)
  const ids = useDeliveryStore((state) => state.ids)
  const version = useDeliveryStore((state) => state.version)

  const vehiclesById = useVehicleStore((state) => state.byId)
  const routesById = useReferenceStore((state) => state.routesById)
  const driversById = useReferenceStore((state) => state.driversById)
  const customersById = useReferenceStore((state) => state.customersById)

  const filters = useUiStore((state) => state.filters)
  const table = useUiStore((state) => state.table)
  const sortTable = useUiStore((state) => state.sortTable)
  const setTablePage = useUiStore((state) => state.setTablePage)
  const setTablePageSize = useUiStore((state) => state.setTablePageSize)
  const toggleColumn = useUiStore((state) => state.toggleColumn)
  const toggleRowSelection = useUiStore((state) => state.toggleRowSelection)
  const toggleRowSelections = useUiStore((state) => state.toggleRowSelections)
  const clearRowSelection = useUiStore((state) => state.clearRowSelection)

  const context = useFilterContext()

  const rows = useMemo(() => {
    const result: DeliveryRow[] = []

    for (const id of ids) {
      const delivery = byId[id]
      if (!delivery || !matchesDeliveryFilters(delivery, filters, context)) {
        continue
      }

      const route = routesById[delivery.routeId]
      const vehicle = delivery.vehicleId
        ? vehiclesById[delivery.vehicleId]
        : undefined
      const driver = delivery.driverId ? driversById[delivery.driverId] : undefined

      result.push({
        delivery,
        customerName: customersById[delivery.customerId]?.name ?? "Unknown",
        driverName: driver?.shortName ?? "Unassigned",
        vehicleCallSign: vehicle?.callSign ?? "—",
        originName: route?.origin.name ?? "—",
        destinationName: route?.destination.name ?? "—",
      })
    }

    result.sort(compareDeliveryRows(table.sortBy, table.sortDirection))
    return result
  }, [
    ids,
    byId,
    version,
    filters,
    context,
    routesById,
    vehiclesById,
    driversById,
    customersById,
    table.sortBy,
    table.sortDirection,
  ])

  const pageState = useMemo(
    () => paginate(rows, table.page, table.pageSize),
    [rows, table.page, table.pageSize]
  )

  const pageIds = useMemo(
    () => pageState.rows.map((row) => row.delivery.id),
    [pageState.rows]
  )

  const pageFullySelected =
    pageIds.length > 0 && pageIds.every((id) => table.selectedIds.includes(id))

  /**
   * Closed deliveries cannot be completed or cancelled, so a mixed selection
   * acts only on the part of it that is still live. The count shown on the
   * action bar is this list, not the raw selection — the operator should never
   * press a button that silently does less than it says.
   */
  const actionableIds = useMemo(
    () =>
      table.selectedIds.filter((id) => {
        const delivery = byId[id]
        return delivery !== undefined && isActiveDeliveryStatus(delivery.status)
      }),
    [table.selectedIds, byId, version]
  )

  const completeSelected = useCallback((): void => {
    const count = actionableIds.length
    for (const id of actionableIds) {
      simulationEngine.completeDeliveryNow(id)
    }
    clearRowSelection()

    // No undo: completions are counted into the day's throughput the moment
    // they close. See `stores/action-journal`.
    notify({
      tone: "success",
      message: `Marked ${count} ${count === 1 ? "delivery" : "deliveries"} delivered`,
    })
  }, [actionableIds, clearRowSelection])

  const cancelSelected = useCallback((): void => {
    // Captured before the cancellations run, because cancelling clears the
    // vehicle a reinstatement would need to put the goods back on.
    const reinstatements = actionableIds
      .map((id) => ({ id, vehicleId: byId[id]?.vehicleId ?? null }))
      .filter(
        (entry): entry is { id: string; vehicleId: string } =>
          entry.vehicleId !== null
      )

    const count = actionableIds.length
    for (const id of actionableIds) {
      simulationEngine.cancelDeliveryNow(id, "Bulk cancelled by dispatcher")
    }
    clearRowSelection()

    const entryId =
      reinstatements.length > 0
        ? useActionJournal.getState().record({
            label: `Cancelled ${count} deliveries`,
            refusalHint:
              "Some of those vehicles have already been given other work.",
            // A partial reinstatement is still worth having: reporting success
            // when any order made it back is more useful than all-or-nothing.
            undo: () =>
              reinstatements
                .map((entry) =>
                  simulationEngine.restoreCancelledDelivery(
                    entry.id,
                    entry.vehicleId
                  )
                )
                .some(Boolean),
          })
        : null

    notify({
      tone: "warning",
      message: `Cancelled ${count} ${count === 1 ? "delivery" : "deliveries"}`,
      ...(entryId === null
        ? {}
        : {
            action: {
              label: "Undo",
              run: () => {
                const applied = useActionJournal.getState().undoEntry(entryId)
                notify(
                  applied
                    ? { tone: "success", message: "Cancellations reversed" }
                    : {
                        tone: "error",
                        message: "Could not reinstate those deliveries",
                        detail: "Their vehicles have since been dispatched.",
                      }
                )
              },
            },
          }),
    })
  }, [actionableIds, byId, clearRowSelection])

  const togglePageSelection = useCallback((): void => {
    toggleRowSelections(pageIds)
  }, [pageIds, toggleRowSelections])

  return {
    rows,
    visibleRows: pageState.rows,
    actionableIds,
    pageFullySelected,
    togglePageSelection,
    completeSelected,
    cancelSelected,
    totalRows: rows.length,
    page: pageState.page,
    pageCount: pageState.pageCount,
    pageSize: table.pageSize,
    sortBy: table.sortBy,
    sortDirection: table.sortDirection,
    hiddenColumns: table.hiddenColumns,
    selectedIds: table.selectedIds,
    sortByColumn: sortTable,
    setPage: setTablePage,
    setPageSize: setTablePageSize,
    toggleColumn,
    toggleRow: toggleRowSelection,
    clearRows: clearRowSelection,
  }
}
