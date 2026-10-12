"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { LayersIcon } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { formatMinutes, formatNumber, formatPercent } from "@/lib/formatting"
import type { BreakdownRow } from "@/hooks/use-analytics"

interface BreakdownChartProps {
  readonly rows: readonly BreakdownRow[]
  readonly dimension: "region" | "corridor"
}

const AXIS_STYLE = { fontSize: 10, fill: "var(--muted-foreground)" } as const

/** Worse on-time performance is drawn hotter, so the chart reads without axes. */
function barColour(onTimeRate: number): string {
  if (onTimeRate >= 0.9) {
    return "#10b981"
  }
  return onTimeRate >= 0.8 ? "#f59e0b" : "#ef4444"
}

function BreakdownTooltip({
  active,
  payload,
}: {
  readonly active?: boolean
  readonly payload?: readonly { payload?: BreakdownRow }[]
}) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) {
    return null
  }

  return (
    <div className="rounded border border-border bg-popover px-2 py-1.5 text-[11px] shadow-md">
      <p className="mb-1 font-medium">{row.label}</p>
      <dl className="space-y-0.5 text-muted-foreground">
        <Line label="Active" value={formatNumber(row.active)} />
        <Line label="Running late" value={formatNumber(row.delayed)} />
        <Line label="Completed" value={formatNumber(row.completed)} />
        <Line label="On time" value={formatPercent(row.onTimeRate)} />
        <Line label="Average delay" value={formatMinutes(row.averageDelayMinutes)} />
        <Line label="Vehicles" value={formatNumber(row.vehicles)} />
      </dl>
    </div>
  )
}

function Line({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="ops-figure font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Live work grouped by where it is going.
 *
 * Bars are the active load and the colour is the on-time rate, so the two
 * things that matter — how much and how badly — are legible in one pass. A
 * busy group that is green needs no attention; a small one that is red does.
 */
export function BreakdownChart({ rows, dimension }: BreakdownChartProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={LayersIcon}
        title="Nothing to break down"
        description={`No ${dimension === "region" ? "region" : "corridor"} has work in the selected window.`}
        compact
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={[...rows]}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke="var(--border)"
          strokeDasharray="2 4"
        />
        <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={96}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)" }}
          content={<BreakdownTooltip />}
        />
        <Bar dataKey="active" name="Active deliveries" radius={[0, 2, 2, 0]}>
          {rows.map((row) => (
            <Cell key={row.id} fill={barColour(row.onTimeRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
