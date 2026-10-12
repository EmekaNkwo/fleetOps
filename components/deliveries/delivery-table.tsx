"use client"

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  PackageSearchIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { DeliveryStatusBadge } from "@/components/shared/status-badge"
import { ProgressRail } from "@/components/shared/meter"
import {
  formatClock,
  formatMinutes,
  formatNumber,
  formatRegion,
} from "@/lib/formatting"
import type { DeliveryRow } from "@/lib/filtering"
import type { DeliveryColumnId, SortDirection } from "@/types"

interface ColumnSpec {
  readonly id: DeliveryColumnId
  readonly label: string
  readonly className: string
  readonly numeric?: boolean
}

const COLUMNS: readonly ColumnSpec[] = [
  { id: "reference", label: "Delivery", className: "w-[7.5rem]" },
  { id: "customer", label: "Customer", className: "min-w-[10rem]" },
  { id: "priority", label: "Priority", className: "w-[5.5rem]" },
  { id: "origin", label: "Origin", className: "w-[9rem]" },
  { id: "destination", label: "Destination", className: "w-[9rem]" },
  { id: "region", label: "Region", className: "w-[8rem]" },
  { id: "driver", label: "Driver", className: "w-[9rem]" },
  { id: "vehicle", label: "Vehicle", className: "w-[4.5rem]", numeric: true },
  { id: "status", label: "Status", className: "w-[7rem]" },
  { id: "eta", label: "ETA", className: "w-[5.5rem]", numeric: true },
  { id: "delay", label: "Delay", className: "w-[5.5rem]", numeric: true },
]

const PAGE_SIZES: readonly number[] = [10, 25, 50, 100]

interface DeliveryTableProps {
  readonly rows: readonly DeliveryRow[]
  readonly totalRows: number
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly sortBy: DeliveryColumnId
  readonly sortDirection: SortDirection
  readonly hiddenColumns: readonly DeliveryColumnId[]
  readonly selectedIds: readonly string[]
  readonly pageFullySelected: boolean
  readonly columnMenuOpen: boolean
  onSort(column: DeliveryColumnId): void
  onPage(page: number): void
  onPageSize(size: number): void
  onToggleColumn(column: DeliveryColumnId): void
  onToggleColumnMenu(): void
  onToggleRow(deliveryId: string): void
  onTogglePageSelection(): void
  onOpenRow(deliveryId: string): void
  onClearFilters(): void
}

/**
 * The delivery board.
 *
 * A plain paginated table rather than a virtualised one: at 25–100 visible rows
 * the DOM cost is trivial, and pagination gives operators a stable frame of
 * reference while rows update underneath them. Sorting, filtering and paging
 * are all computed in `useDeliveries` — this renders the result.
 */
export function DeliveryTable({
  rows,
  totalRows,
  page,
  pageCount,
  pageSize,
  sortBy,
  sortDirection,
  hiddenColumns,
  selectedIds,
  pageFullySelected,
  columnMenuOpen,
  onSort,
  onPage,
  onPageSize,
  onToggleColumn,
  onToggleColumnMenu,
  onToggleRow,
  onTogglePageSelection,
  onOpenRow,
  onClearFilters,
}: DeliveryTableProps) {
  const visibleColumns = COLUMNS.filter(
    (column) => !hiddenColumns.includes(column.id)
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <span className="ops-label">
          {formatNumber(totalRows)} deliveries
        </span>
        {selectedIds.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {selectedIds.length} selected
          </span>
        ) : null}

        <div className="relative ml-auto">
          <Button
            variant="outline"
            size="xs"
            onClick={onToggleColumnMenu}
            aria-expanded={columnMenuOpen}
            aria-haspopup="true"
          >
            <Columns3Icon aria-hidden="true" />
            Columns
          </Button>
          {columnMenuOpen ? (
            <div
              role="group"
              aria-label="Toggle column visibility"
              className="absolute top-full right-0 z-20 mt-1 w-44 rounded border border-border bg-popover p-1 shadow-md"
            >
              {COLUMNS.map((column) => {
                const visible = !hiddenColumns.includes(column.id)
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => onToggleColumn(column.id)}
                      className="size-3 accent-primary"
                    />
                    {column.label}
                  </label>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ops-scroll min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageSearchIcon}
            title="No deliveries match the current view"
            description="Every delivery has been filtered out. Clear the filters to see the full board again."
            action={
              <Button variant="outline" size="xs" onClick={onClearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              Deliveries, sorted by {sortBy} {sortDirection === "asc" ? "ascending" : "descending"}
            </caption>
            <thead className="sticky top-0 z-10">
              <tr className="ops-chrome">
                <th scope="col" className="w-7 border-b border-border px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={pageFullySelected}
                    onChange={onTogglePageSelection}
                    aria-label="Select every delivery on this page"
                    className="size-3 accent-primary"
                  />
                </th>
                {visibleColumns.map((column) => {
                  const active = sortBy === column.id
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={
                        active
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={cn(
                        "border-b border-border px-2 py-1.5 text-left font-medium",
                        column.className
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(column.id)}
                        className={cn(
                          "ops-label flex items-center gap-1 hover:text-foreground",
                          active && "text-foreground",
                          column.numeric && "ml-auto"
                        )}
                      >
                        {column.label}
                        {active ? (
                          sortDirection === "asc" ? (
                            <ArrowUpIcon className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowDownIcon className="size-3" aria-hidden="true" />
                          )
                        ) : null}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = selectedIds.includes(row.delivery.id)
                return (
                  <tr
                    key={row.delivery.id}
                    onClick={() => onOpenRow(row.delivery.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent",
                      selected && "bg-accent"
                    )}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onToggleRow(row.delivery.id)}
                        aria-label={`Select delivery ${row.delivery.reference}`}
                        className="size-3 accent-primary"
                      />
                    </td>
                    {visibleColumns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "max-w-0 truncate px-2 py-1",
                          column.numeric && "text-right"
                        )}
                      >
                        {renderCell(column.id, row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-2">
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="rounded border border-border bg-card px-1 py-0.5 text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <span className="ops-figure ml-auto text-[11px] text-muted-foreground">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function renderCell(column: DeliveryColumnId, row: DeliveryRow) {
  const { delivery } = row

  switch (column) {
    case "reference":
      return (
        <span className="ops-figure font-medium">#{delivery.reference}</span>
      )
    case "customer":
      return <span className="truncate">{row.customerName}</span>
    case "origin":
      return <span className="truncate text-muted-foreground">{row.originName}</span>
    case "destination":
      return (
        <div className="min-w-0">
          <span className="block truncate">{row.destinationName}</span>
          <ProgressRail
            fraction={delivery.progressFraction}
            label={`Progress of ${delivery.reference}`}
            className="mt-1 h-0.5"
          />
        </div>
      )
    case "priority":
      return (
        <span
          className={cn(
            "text-[11px] font-medium capitalize",
            delivery.priority === "CRITICAL"
              ? "text-red-600 dark:text-red-400"
              : delivery.priority === "EXPRESS"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          )}
        >
          {delivery.priority.toLowerCase()}
        </span>
      )
    case "region":
      // The destination region is the one a dispatcher works by: it is where
      // the consignment has to arrive and whose depot owns the problem.
      return (
        <span className="truncate text-muted-foreground">
          {formatRegion(delivery.destinationRegion)}
        </span>
      )
    case "driver":
      return <span className="truncate text-muted-foreground">{row.driverName}</span>
    case "vehicle":
      return <span className="ops-figure">{row.vehicleCallSign}</span>
    case "status":
      return <DeliveryStatusBadge status={delivery.status} />
    case "eta":
      return (
        <span className="ops-figure">
          {delivery.status === "COMPLETED" && delivery.completedAt
            ? formatClock(delivery.completedAt)
            : formatClock(delivery.etaAt)}
        </span>
      )
    case "delay":
      return (
        <span
          className={cn(
            "ops-figure",
            delivery.delayMinutes > 30
              ? "text-red-600 dark:text-red-400"
              : delivery.delayMinutes > 0
                ? "text-orange-600 dark:text-orange-400"
                : "text-muted-foreground"
          )}
        >
          {delivery.delayMinutes > 0 ? formatMinutes(delivery.delayMinutes) : "—"}
        </span>
      )
    default:
      return null
  }
}
