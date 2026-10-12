"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { EmptyState } from "@/components/shared/empty-state"
import { ActivityIcon } from "lucide-react"
import type { MetricSample } from "@/types"

interface ThroughputChartProps {
  readonly series: readonly MetricSample[]
}

const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
} as const

function ChartTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean
  readonly payload?: readonly { name?: string; value?: number; color?: string }[]
  readonly label?: string
}) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div className="rounded border border-border bg-popover px-2 py-1.5 text-[11px] shadow-md">
      <p className="ops-figure mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ops-figure ml-auto font-medium">
            {typeof entry.value === "number" ? Math.round(entry.value) : "—"}
          </span>
        </p>
      ))}
    </div>
  )
}

/**
 * Rolling throughput. Samples are appended by the wiring layer on a timer, so
 * the chart is a genuine time series of the running operation rather than a
 * re-render of the current snapshot.
 */
export function ThroughputChart({ series }: ThroughputChartProps) {
  if (series.length < 2) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="Collecting samples"
        description="The throughput series builds up as the simulation runs. Start it to see deliveries per sample window."
        compact
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={[...series]} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          stroke="var(--border)"
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis tick={AXIS_STYLE} stroke="var(--border)" width={44} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="completed"
          name="Delivered today"
          stroke="var(--chart-2)"
          strokeWidth={1.75}
          fill="url(#completedFill)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="inTransit"
          name="In transit"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="delayed"
          name="Delayed"
          stroke="var(--chart-4)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
