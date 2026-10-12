"use client"

import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ClearFiltersButton,
  RegionFilterGroup,
  VehicleStatusFilterGroup,
} from "@/components/dashboard/filter-controls"
import { MetricsGrid } from "@/components/dashboard/metrics-grid"
import { Meter } from "@/components/shared/meter"
import { VehicleList } from "@/components/vehicles/vehicle-list"
import { formatMinutes, formatPercent } from "@/lib/formatting"
import {
  useDeliveries,
  useFleet,
  useMetrics,
  useOperationsFilters,
} from "@/hooks"

interface OperationsSidebarProps {
  readonly compact: boolean
  readonly open: boolean
  onClose(): void
}

/**
 * The left rail: overview numbers, fleet health, filters and the fleet list.
 *
 * On tablet widths it becomes an overlay drawer rather than being hidden —
 * dispatchers still need the numbers, they just cannot have them permanently
 * on screen.
 */
export function OperationsSidebar({
  compact,
  open,
  onClose,
}: OperationsSidebarProps) {
  const metrics = useMetrics()
  const fleet = useFleet()
  const deliveries = useDeliveries()
  const filters = useOperationsFilters()

  const body =
    (
      /*
       * Two scroll regions, not one.
       *
       * With the whole rail in a single scroller, paging the fleet scrolled the
       * overview off the top — the browser brings the focused pager into view,
       * and the pager sat at the bottom of a very tall column. The summary
       * sections now scroll on their own, and the fleet list owns the remaining
       * height with its pager pinned to the bottom of the rail.
       */
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="ops-scroll min-h-0 flex-1 overflow-y-auto">
          <section
            aria-label="Operations overview"
            className="border-b border-border p-2"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="ops-label">Overview</h2>
              <span className="text-[10px] text-muted-foreground">
                baseline {metrics.baselineLabel}
              </span>
            </div>
            <MetricsGrid
              kpis={metrics.kpis}
              activeStatus={deliveries.statusFilter}
              onDrilldown={deliveries.setStatusFilter}
            />
          </section>

          <section
            aria-label="Filters"
            className="space-y-2 border-b border-border p-2.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="ops-label">Vehicle status</h2>
              <ClearFiltersButton
                activeCount={filters.activeCount}
                onClear={filters.reset}
              />
            </div>
            <VehicleStatusFilterGroup
              value={fleet.statusFilter}
              countFor={fleet.countByStatus}
              total={fleet.counts.total}
              onChange={fleet.setStatusFilter}
            />
            <h2 className="ops-label pt-1">Region</h2>
            <RegionFilterGroup
              regions={filters.regions}
              selected={filters.value.regions}
              onToggle={filters.toggleRegion}
            />
          </section>
          <section
            aria-label="Fleet performance"
            className="space-y-3 border-b border-border p-2.5"
          >
            <h2 className="ops-label">Fleet performance</h2>
            <Meter
              label="Fleet utilisation"
              fraction={metrics.metrics.fleetUtilisation}
              display={formatPercent(metrics.metrics.fleetUtilisation)}
              tone={metrics.metrics.fleetUtilisation > 0.75 ? "good" : "warn"}
              segments={16}
            />
            <Meter
              label="On-time deliveries"
              fraction={metrics.metrics.onTimeRate}
              display={formatPercent(metrics.metrics.onTimeRate)}
              tone={
                metrics.metrics.onTimeRate > 0.9
                  ? "good"
                  : metrics.metrics.onTimeRate > 0.8
                    ? "warn"
                    : "bad"
              }
              segments={16}
            />
            <Meter
              label="Vehicle availability"
              fraction={metrics.metrics.fleetAvailability}
              display={formatPercent(metrics.metrics.fleetAvailability)}
              tone={metrics.metrics.fleetAvailability > 0.95 ? "good" : "warn"}
              segments={16}
            />
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="ops-label">Average delay</span>
              <span className="ops-figure text-sm font-medium">
                {formatMinutes(metrics.metrics.averageDelayMinutes)}
              </span>
            </div>
          </section>
        </div>

        <section
          aria-label="Fleet list"
          className="flex min-h-[12rem] flex-1 flex-col"
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2.5">
            <h2 className="ops-label">
              Fleet · {fleet.matchingVehicles.length}
              {fleet.isFiltered ? ` of ${fleet.counts.total}` : ""}
            </h2>
          </div>
          <div className="min-h-0 flex-1">
            <VehicleList
              vehicles={fleet.visibleVehicles}
              selectedVehicleId={fleet.selectedVehicleId}
              emptyHint="Loosen the status or region filters to see more of the fleet."
              page={fleet.page}
              pageCount={fleet.pageCount}
              pageSize={fleet.pageSize}
              pageSizes={fleet.pageSizes}
              rangeStart={fleet.rangeStart}
              rangeEnd={fleet.rangeEnd}
              totalCount={fleet.matchingVehicles.length}
              onSelect={fleet.focusOnMap}
              onPage={fleet.setPage}
              onPageSize={fleet.setPageSize}
            />
          </div>
        </section>
      </div>
    )

  if (!compact) {
    return (
      <aside
        aria-label="Operations overview"
        className="ops-rail hidden w-[19rem] shrink-0 flex-col border-r border-border lg:flex"
      >
        {body}
      </aside>
    )
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 flex lg:hidden">
      {/*
       * Click-away scrim. Deliberately not a labelled control: the close
       * button and Escape already expose that action, and a second
       * identically named button only duplicates it in the accessibility
       * tree.
       */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        aria-label="Operations overview"
        className={cn(
          "ops-rail relative z-10 flex w-[20rem] max-w-[85vw] flex-col border-r border-border",
          "animate-in duration-150 slide-in-from-left-4 motion-reduce:animate-none"
        )}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2">
          <span className="ops-label">Overview</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close overview drawer"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        {body}
      </aside>
    </div>
  )
}
