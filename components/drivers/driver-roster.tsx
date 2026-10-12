"use client"

import { UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable, type DataColumn } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import {
  DriverStatusBadge,
  StatusDot,
} from "@/components/shared/status-badge"
import { formatMinutes, formatNumber } from "@/lib/formatting"
import { DRIVER_STATUS_ORDER, DRIVER_STATUS_TOKENS } from "@/lib/status-tokens"
import { useDriverRoster, type DriverRosterRow } from "@/hooks/use-driver-roster"
import { DRIVER_PAGE_SIZES } from "@/hooks/use-driver-roster"
import type { DriverColumnId, DriverStatusFilter } from "@/types"

const COLUMNS: readonly DataColumn<DriverRosterRow, DriverColumnId>[] = [
  {
    id: "name",
    label: "Driver",
    className: "min-w-[11rem]",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <StatusDot token={DRIVER_STATUS_TOKENS[row.driver.status]} />
        <span className="truncate font-medium">{row.driver.name}</span>
      </span>
    ),
  },
  {
    id: "status",
    label: "Status",
    className: "w-[7.5rem]",
    render: (row) => <DriverStatusBadge status={row.driver.status} />,
  },
  {
    id: "region",
    label: "Base",
    className: "w-[8rem]",
    render: (row) => (
      <span className="text-muted-foreground">{row.regionName}</span>
    ),
  },
  {
    id: "vehicle",
    label: "Vehicle",
    className: "w-[6rem]",
    numeric: true,
    render: (row) => row.vehicleCallSign,
  },
  {
    id: "active",
    label: "Active",
    className: "w-[5rem]",
    numeric: true,
    render: (row) => formatNumber(row.activeCount),
  },
  {
    id: "delayed",
    label: "Late",
    className: "w-[7rem]",
    numeric: true,
    render: (row) =>
      row.delayedCount === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "font-medium",
            row.worstDelayMinutes >= 30 ? "text-red-500" : "text-orange-500"
          )}
          title={`Worst slippage ${formatMinutes(row.worstDelayMinutes)}`}
        >
          {formatNumber(row.delayedCount)} · {formatMinutes(row.worstDelayMinutes)}
        </span>
      ),
  },
  {
    id: "completed",
    label: "Done today",
    className: "w-[6.5rem]",
    numeric: true,
    render: (row) => formatNumber(row.completedToday),
  },
  {
    id: "rating",
    label: "Rating",
    className: "w-[5rem]",
    numeric: true,
    render: (row) => row.driver.rating.toFixed(1),
  },
]

/**
 * The roster.
 *
 * Sorted by live workload rather than alphabetically: the question this screen
 * answers is "who is carrying too much and who is free", and a name-ordered
 * list of 520 people answers neither. Opening a row selects the driver, which
 * is the same selection the vehicle panel and search produce — so their record
 * slides over with their full workload already loaded.
 */
export function DriverRoster() {
  const roster = useDriverRoster()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-2 py-1.5">
        <Summary label="On duty" value={roster.summary.onDuty} />
        <Summary label="Available" value={roster.summary.idle} tone="good" />
        <Summary
          label="Carrying delays"
          value={roster.summary.carryingDelays}
          tone={roster.summary.carryingDelays > 0 ? "warn" : undefined}
        />
        <Summary
          label="Unreachable"
          value={roster.summary.unreachable}
          tone={roster.summary.unreachable > 0 ? "bad" : undefined}
        />

        <div
          role="group"
          aria-label="Driver status"
          className="ml-auto flex items-center gap-1"
        >
          <StatusChip
            label="All"
            active={roster.statusFilter === "ALL"}
            onClick={() => roster.setStatusFilter("ALL")}
          />
          {DRIVER_STATUS_ORDER.map((status) => (
            <StatusChip
              key={status}
              label={status.replace("_", " ").toLowerCase()}
              active={roster.statusFilter === status}
              onClick={() => roster.setStatusFilter(status as DriverStatusFilter)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DataTable
          caption="Driver roster"
          rowLabel="drivers"
          columns={COLUMNS}
          rows={roster.visibleRows}
          rowKey={(row) => row.driver.id}
          totalRows={roster.totalRows}
          sortBy={roster.sortBy}
          sortDirection={roster.sortDirection}
          page={roster.page}
          pageCount={roster.pageCount}
          pageSize={roster.pageSize}
          pageSizes={DRIVER_PAGE_SIZES}
          selectedKey={roster.selectedDriverId}
          onSort={roster.sortByColumn}
          onPage={roster.setPage}
          onPageSize={roster.setPageSize}
          onOpenRow={(row) => roster.select(row.driver.id)}
          empty={
            <EmptyState
              icon={UsersIcon}
              title="No drivers match the current view"
              description="Clear the region or status filters to see the full roster again."
            />
          }
        />
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  readonly label: string
  readonly value: number
  readonly tone?: "good" | "warn" | "bad"
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "ops-figure text-sm font-semibold",
          tone === "good" && "text-emerald-500",
          tone === "warn" && "text-orange-500",
          tone === "bad" && "text-red-500"
        )}
      >
        {formatNumber(value)}
      </span>
      <span className="ops-label">{label}</span>
    </p>
  )
}

function StatusChip({
  label,
  active,
  onClick,
}: {
  readonly label: string
  readonly active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-border bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent"
      )}
    >
      {label}
    </button>
  )
}
