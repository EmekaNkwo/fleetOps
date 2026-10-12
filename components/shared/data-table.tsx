"use client"

import type { ReactNode } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/formatting"
import type { SortDirection } from "@/types"

export interface DataColumn<TRow, TColumnId extends string> {
  readonly id: TColumnId
  readonly label: string
  readonly className?: string
  readonly numeric?: boolean
  /** Columns without a comparator in the hook are rendered unsortable. */
  readonly sortable?: boolean
  render(row: TRow): ReactNode
}

interface DataTableProps<TRow, TColumnId extends string> {
  readonly caption: string
  readonly columns: readonly DataColumn<TRow, TColumnId>[]
  readonly rows: readonly TRow[]
  readonly rowKey: (row: TRow) => string
  readonly sortBy: TColumnId
  readonly sortDirection: SortDirection
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly pageSizes: readonly number[]
  readonly totalRows: number
  readonly rowLabel: string
  readonly selectedKey?: string | null
  readonly empty: ReactNode
  readonly toolbar?: ReactNode
  onSort(column: TColumnId): void
  onPage(page: number): void
  onPageSize(size: number): void
  onOpenRow?: (row: TRow) => void
}

/**
 * The sortable, paginated table shared by the roster, the corridor view and the
 * fuel worklist.
 *
 * The delivery board keeps its own implementation: it carries row selection,
 * bulk actions and column visibility, and generalising those three into this
 * component would make every other caller pay for options it does not have.
 * Three tables with the same behaviour is a component; four tables where one is
 * different is a component plus a special case.
 */
export function DataTable<TRow, TColumnId extends string>({
  caption,
  columns,
  rows,
  rowKey,
  sortBy,
  sortDirection,
  page,
  pageCount,
  pageSize,
  pageSizes,
  totalRows,
  rowLabel,
  selectedKey,
  empty,
  toolbar,
  onSort,
  onPage,
  onPageSize,
  onOpenRow,
}: DataTableProps<TRow, TColumnId>) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <span className="ops-label">
          {formatNumber(totalRows)} {rowLabel}
        </span>
        {toolbar ? <div className="ml-auto flex items-center gap-1.5">{toolbar}</div> : null}
      </div>

      <div className="ops-scroll min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          empty
        ) : (
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              {caption}, sorted by {sortBy}{" "}
              {sortDirection === "asc" ? "ascending" : "descending"}
            </caption>
            <thead className="sticky top-0 z-10">
              <tr className="ops-chrome">
                {columns.map((column) => {
                  const active = sortBy === column.id
                  const sortable = column.sortable !== false

                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={
                        !sortable
                          ? undefined
                          : active
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
                      {sortable ? (
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
                      ) : (
                        <span
                          className={cn("ops-label block", column.numeric && "text-right")}
                        >
                          {column.label}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row)
                return (
                  <tr
                    key={key}
                    onClick={onOpenRow ? () => onOpenRow(row) : undefined}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      onOpenRow && "cursor-pointer hover:bg-accent",
                      selectedKey === key && "bg-accent"
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "max-w-0 truncate px-2 py-1",
                          column.numeric && "ops-figure text-right"
                        )}
                      >
                        {column.render(row)}
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
            aria-label={`${rowLabel} per page`}
          >
            {pageSizes.map((size) => (
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
          aria-label={`Previous page of ${rowLabel}`}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label={`Next page of ${rowLabel}`}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
