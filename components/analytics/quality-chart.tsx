"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { GaugeIcon } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { VEHICLE_STATUS_TOKENS } from "@/lib/status-tokens"
import type { FleetCounts, MetricSample, VehicleStatus } from "@/types"

const AXIS_STYLE = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
} as const

interface QualityChartProps {
  readonly series: readonly MetricSample[]
}

/** On-time rate and ETA accuracy over time, as percentages on one axis. */
export function QualityChart({ series }: QualityChartProps) {
  if (series.length < 2) {
    return (
      <EmptyState
        icon={GaugeIcon}
        title="Collecting samples"
        description="Service-quality trends appear once the simulation has been running for a few sample windows."
        compact
      />
    )
  }

  const data = series.map((sample) => ({
    label: sample.label,
    onTime: Math.round(sample.onTimeRate * 100),
    accuracy: Math.round(sample.etaAccuracy * 100),
    delay: Math.round(sample.averageDelayMinutes),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          stroke="var(--border)"
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tick={AXIS_STYLE}
          stroke="var(--border)"
          width={44}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 11,
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
        />
        <Line
          type="monotone"
          dataKey="onTime"
          name="On-time %"
          stroke="var(--chart-2)"
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          name="ETA accuracy %"
          stroke="var(--chart-1)"
          strokeWidth={1.75}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

interface FleetMixChartProps {
  readonly counts: FleetCounts
}

/** Current fleet composition by status, coloured from the shared tokens. */
export function FleetMixChart({ counts }: FleetMixChartProps) {
  const data: readonly { status: VehicleStatus; label: string; value: number }[] =
    [
      { status: "ON_ROUTE", label: "On route", value: counts.onRoute },
      { status: "AT_RISK", label: "At risk", value: counts.atRisk },
      { status: "DELAYED", label: "Delayed", value: counts.delayed },
      { status: "IDLE", label: "Idle", value: counts.idle },
      { status: "OFFLINE", label: "Offline", value: counts.offline },
    ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} stroke="var(--border)" />
        <YAxis tick={AXIS_STYLE} stroke="var(--border)" width={44} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 11,
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
        />
        <Bar dataKey="value" name="Vehicles" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={VEHICLE_STATUS_TOKENS[entry.status].canvas}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
