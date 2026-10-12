"use client"

import { PackagePlusIcon, RouteIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable, type DataColumn } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { TrafficBadge } from "@/components/shared/status-badge"
import { formatDistance, formatMinutes, formatNumber } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { useDispatch } from "@/hooks"
import { ROUTE_PAGE_SIZES, useRoutes, type RouteRow } from "@/hooks/use-routes"
import type { RouteColumnId, TrafficLevel } from "@/types"

const TRAFFIC_LEVELS: readonly TrafficLevel[] = ["normal", "slow", "congested"]

/**
 * Built per render so the dispatch callback is in scope. The column set is
 * static otherwise — only the action cell needs anything from the component.
 */
function buildColumns(
  onDispatch: (routeId: string) => void
): readonly DataColumn<RouteRow, RouteColumnId>[] {
  return [
    ...COLUMNS,
    {
      id: "actions",
      label: "",
      className: "w-[6.5rem]",
      sortable: false,
      render: (row) => (
        <Button
          variant="outline"
          size="xs"
          onClick={(event) => {
            // The row itself navigates to the map; dispatching should not.
            event.stopPropagation()
            onDispatch(row.route.id)
          }}
          aria-label={`Dispatch a delivery on ${row.route.name}`}
        >
          <PackagePlusIcon aria-hidden="true" />
          Dispatch
        </Button>
      ),
    },
  ]
}

const COLUMNS: readonly DataColumn<RouteRow, RouteColumnId>[] = [
  {
    id: "name",
    label: "Corridor",
    className: "min-w-[13rem]",
    render: (row) => (
      <span className="block truncate font-medium">{row.route.name}</span>
    ),
  },
  {
    id: "origin",
    label: "From",
    className: "w-[8rem]",
    render: (row) => (
      <span className="text-muted-foreground">{row.originRegionName}</span>
    ),
  },
  {
    id: "destination",
    label: "To",
    className: "w-[8rem]",
    render: (row) => (
      <span className="text-muted-foreground">{row.destinationRegionName}</span>
    ),
  },
  {
    id: "distance",
    label: "Distance",
    className: "w-[6rem]",
    numeric: true,
    render: (row) => formatDistance(row.route.totalDistanceKm),
  },
  {
    id: "traffic",
    label: "Traffic",
    className: "w-[8rem]",
    render: (row) => (
      <span title={row.trafficDescription}>
        <TrafficBadge level={row.trafficLevel} />
      </span>
    ),
  },
  {
    id: "speed",
    label: "Speed",
    className: "w-[7rem]",
    numeric: true,
    render: (row) => (
      <span
        className={cn(
          row.effectiveSpeedKmh < row.route.freeFlowSpeed * 0.6 && "text-orange-500"
        )}
        title={`Free flow ${row.route.freeFlowSpeed} km/h`}
      >
        {Math.round(row.effectiveSpeedKmh)} km/h
      </span>
    ),
  },
  {
    id: "vehicles",
    label: "Vehicles",
    className: "w-[5.5rem]",
    numeric: true,
    render: (row) => formatNumber(row.vehicleCount),
  },
  {
    id: "deliveries",
    label: "Active",
    className: "w-[5rem]",
    numeric: true,
    render: (row) => formatNumber(row.activeDeliveries),
  },
  {
    id: "delayed",
    label: "Late",
    className: "w-[7.5rem]",
    numeric: true,
    render: (row) =>
      row.delayedDeliveries === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "font-medium",
            row.averageDelayMinutes >= 20 ? "text-red-500" : "text-orange-500"
          )}
        >
          {formatNumber(row.delayedDeliveries)} ·{" "}
          {formatMinutes(row.averageDelayMinutes)}
        </span>
      ),
  },
]

/**
 * The corridor board.
 *
 * Opening a row takes the operator to the map with a vehicle on that corridor
 * focused — the table says which corridor is in trouble, the map says what it
 * looks like, and the two stay in step through the existing selection.
 */
export function RouteBoard() {
  const routes = useRoutes()
  const dispatch = useDispatch()
  const columns = buildColumns((routeId) => dispatch.dispatchNew(routeId))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-2 py-1.5">
        <Summary label="Clear" value={routes.summary.clear} tone="good" />
        <Summary label="Slow" value={routes.summary.slow} tone="warn" />
        <Summary
          label="Congested"
          value={routes.summary.congested}
          tone={routes.summary.congested > 0 ? "bad" : undefined}
        />
        {routes.summary.worstRouteName ? (
          <p className="truncate text-[11px] text-muted-foreground">
            Worst backlog:{" "}
            <span className="font-medium text-foreground">
              {routes.summary.worstRouteName}
            </span>
          </p>
        ) : null}

        <div
          role="group"
          aria-label="Traffic level"
          className="ml-auto flex items-center gap-1"
        >
          <LevelChip
            label="All"
            active={routes.trafficFilter === "ALL"}
            onClick={() => routes.setTrafficFilter("ALL")}
          />
          {TRAFFIC_LEVELS.map((level) => (
            <LevelChip
              key={level}
              label={level}
              active={routes.trafficFilter === level}
              onClick={() => routes.setTrafficFilter(level)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DataTable
          caption="Route corridors"
          rowLabel="routes"
          columns={columns}
          rows={routes.visibleRows}
          rowKey={(row) => row.route.id}
          totalRows={routes.totalRows}
          sortBy={routes.sortBy}
          sortDirection={routes.sortDirection}
          page={routes.page}
          pageCount={routes.pageCount}
          pageSize={routes.pageSize}
          pageSizes={ROUTE_PAGE_SIZES}
          onSort={routes.sortByColumn}
          onPage={routes.setPage}
          onPageSize={routes.setPageSize}
          onOpenRow={(row) => routes.highlight(row.route.id)}
          empty={
            <EmptyState
              icon={RouteIcon}
              title="No corridors match the current view"
              description="Clear the region or traffic filters to see the whole network again."
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
          tone === "warn" && "text-amber-500",
          tone === "bad" && "text-red-500"
        )}
      >
        {formatNumber(value)}
      </span>
      <span className="ops-label">{label}</span>
    </p>
  )
}

function LevelChip({
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
