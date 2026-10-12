"use client"

import { useState } from "react"
import { useDeliveries, useDeliveryBoard, useOperationsFilters } from "@/hooks"
import { BulkActionBar } from "./bulk-action-bar"
import { DeliveryTable } from "./delivery-table"

/**
 * Container for the delivery board.
 *
 * It exists so the expensive table projection is scoped to the one screen that
 * needs it: this component is mounted only while the deliveries tab is open,
 * so `useDeliveryBoard` stops running the moment the operator switches away.
 */
export function DeliveryBoard() {
  const board = useDeliveryBoard()
  const { selectDelivery } = useDeliveries()
  const filters = useOperationsFilters()
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BulkActionBar
        selectedCount={board.selectedIds.length}
        actionableCount={board.actionableIds.length}
        onComplete={board.completeSelected}
        onCancel={board.cancelSelected}
        onClear={board.clearRows}
      />
      <div className="min-h-0 flex-1">
        <DeliveryTable
          rows={board.visibleRows}
          totalRows={board.totalRows}
          page={board.page}
          pageCount={board.pageCount}
          pageSize={board.pageSize}
          sortBy={board.sortBy}
          sortDirection={board.sortDirection}
          hiddenColumns={board.hiddenColumns}
          selectedIds={board.selectedIds}
          columnMenuOpen={columnMenuOpen}
          onSort={board.sortByColumn}
          onPage={board.setPage}
          onPageSize={board.setPageSize}
          onToggleColumn={board.toggleColumn}
          onToggleColumnMenu={() => setColumnMenuOpen((open) => !open)}
          onToggleRow={board.toggleRow}
          pageFullySelected={board.pageFullySelected}
          onTogglePageSelection={board.togglePageSelection}
          onOpenRow={selectDelivery}
          onClearFilters={filters.reset}
        />
      </div>
    </div>
  )
}
