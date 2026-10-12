"use client"

import { cn } from "@/lib/utils"
import { Panel } from "@/components/shared/panel"
import { Meter } from "@/components/shared/meter"
import { MetricsGrid } from "@/components/dashboard/metrics-grid"
import {
  formatMinutes,
  formatNumber,
  formatPercent,
} from "@/lib/formatting"
import { useDeliveries, useFleet, useMetrics } from "@/hooks"
import { useAnalytics } from "@/hooks/use-analytics"
import { BreakdownChart } from "./breakdown-chart"
import { FleetMixChart, QualityChart } from "./quality-chart"
import { ThroughputChart } from "./throughput-chart"

/**
 * Operational performance view. Everything here is derived from the same
 * aggregates the rest of the console uses, so a number on this screen can never
 * disagree with the same number on the overview rail.
 */
export function AnalyticsView() {
  const metrics = useMetrics()
  const fleet = useFleet()
  const deliveries = useDeliveries()
  const analytics = useAnalytics()
  const m = metrics.metrics

  return (
    <div className="ops-scroll h-full overflow-y-auto p-2">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div role="group" aria-label="Time range" className="flex items-center gap-1">
          <span className="ops-label mr-0.5">Window</span>
          {analytics.ranges.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={analytics.range === option.id}
              onClick={() => analytics.setRange(option.id)}
            />
          ))}
        </div>

        <div
          role="group"
          aria-label="Breakdown dimension"
          className="flex items-center gap-1"
        >
          <span className="ops-label mr-0.5">Group by</span>
          <Chip
            label="Region"
            active={analytics.dimension === "region"}
            onClick={() => analytics.setDimension("region")}
          />
          <Chip
            label="Corridor"
            active={analytics.dimension === "corridor"}
            onClick={() => analytics.setDimension("corridor")}
          />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Windows are measured in simulated time, which runs well ahead of the
          clock on the wall.
        </p>
      </div>

      <div className="grid gap-2 xl:grid-cols-3">
        {/*
         * Full width and first. A `col-span-3` panel placed mid-grid cannot
         * fit in the columns left over from the row above it, so it wraps and
         * leaves a gap — which orphaned the panel before it in a row of its
         * own. Leading with it keeps every later row exactly three wide.
         */}
        <Panel
          title={
            analytics.dimension === "region"
              ? "Load by destination region"
              : "Load by corridor"
          }
          subtitle="bar is active work, colour is on-time rate"
          className="xl:col-span-3"
          bodyClassName="h-72 p-1"
        >
          <BreakdownChart
            rows={analytics.breakdown}
            dimension={analytics.dimension}
          />
        </Panel>

        <Panel
          title="Throughput"
          subtitle="deliveries over the session"
          className="xl:col-span-2"
          bodyClassName="h-56 p-1"
        >
          <ThroughputChart series={analytics.series} />
        </Panel>

        <Panel title="Service quality" bodyClassName="space-y-3 p-3">
          <Meter
            label="On-time delivery rate"
            fraction={m.onTimeRate}
            display={formatPercent(m.onTimeRate)}
            tone={m.onTimeRate > 0.9 ? "good" : m.onTimeRate > 0.8 ? "warn" : "bad"}
          />
          <Meter
            label="ETA accuracy"
            fraction={m.etaAccuracy}
            display={formatPercent(m.etaAccuracy)}
            tone={m.etaAccuracy > 0.85 ? "good" : "warn"}
          />
          <Meter
            label="Fleet utilisation"
            fraction={m.fleetUtilisation}
            display={formatPercent(m.fleetUtilisation)}
            tone={m.fleetUtilisation > 0.75 ? "good" : "warn"}
          />
          <Meter
            label="Vehicle availability"
            fraction={m.fleetAvailability}
            display={formatPercent(m.fleetAvailability)}
            tone={m.fleetAvailability > 0.95 ? "good" : "warn"}
          />
        </Panel>

        <Panel
          title="Delivery timing"
          bodyClassName="grid grid-cols-2 gap-x-4 gap-y-3 p-3"
        >
          <Stat
            label="Average delay"
            value={formatMinutes(m.averageDelayMinutes)}
            hint="across live deliveries running late"
          />
          <Stat
            label="Average delivery time"
            value={formatMinutes(m.averageDeliveryMinutes)}
            hint="pickup to drop-off, completed runs"
          />
          <Stat
            label="Deliveries per hour"
            value={formatNumber(m.deliveriesPerHour)}
            hint="completed in the last operating hour"
          />
          <Stat
            label="Open incidents"
            value={formatNumber(m.openIncidents)}
            hint={`${formatNumber(m.openAlerts)} alerts awaiting action`}
          />
        </Panel>

        <Panel
          title="Service quality trend"
          subtitle="on-time vs ETA accuracy"
          className="xl:col-span-2"
          bodyClassName="h-56 p-1"
        >
          <QualityChart series={analytics.series} />
        </Panel>

        <Panel title="Fleet composition" bodyClassName="h-56 p-1">
          <FleetMixChart counts={fleet.counts} />
        </Panel>

        <Panel
          title="Operations overview"
          className="xl:col-span-2"
          bodyClassName="p-2"
        >
          <MetricsGrid
            kpis={metrics.kpis}
            activeStatus={deliveries.statusFilter}
            columns={4}
            onDrilldown={deliveries.setStatusFilter}
          />
        </Panel>
      </div>
    </div>
  )
}

function Chip({
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
        "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
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

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly hint: string
}) {
  return (
    <div className="min-w-0">
      <p className="ops-label">{label}</p>
      <p className="ops-figure mt-0.5 text-xl leading-none font-semibold">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
