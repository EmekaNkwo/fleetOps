"use client"

import { PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatNumber } from "@/lib/formatting"
import type { OperationsMetrics } from "@/types"

export interface OperationsBriefingProps {
  readonly open: boolean
  readonly metrics: OperationsMetrics
  readonly totalDeliveries: number
  readonly running: boolean
  onStart(): void
  onDismiss(): void
}

/**
 * Opening briefing.
 *
 * The first thirty seconds decide whether a reviewer understands what they are
 * looking at, so the shift opens with the numbers that matter and one button
 * that makes everything start moving.
 */
export function OperationsBriefing({
  open,
  metrics,
  totalDeliveries,
  running,
  onStart,
  onDismiss,
}: OperationsBriefingProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onDismiss()
        }
      }}
    >
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogTitle className="text-base">Live operations</DialogTitle>
        <DialogDescription className="text-xs">
          FleetOps Command Center is monitoring a Nigerian logistics network in
          real time. Nothing here is pre-recorded — a simulation engine drives
          the fleet and every panel reacts to the events it publishes.
        </DialogDescription>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-y border-border py-3">
          <Stat
            label="Deliveries monitored"
            value={formatNumber(totalDeliveries)}
          />
          <Stat label="Currently in transit" value={formatNumber(metrics.inTransit)} />
          <Stat label="Delayed" value={formatNumber(metrics.delayed)} />
          <Stat label="At risk" value={formatNumber(metrics.atRisk)} />
          <Stat label="Vehicles online" value={formatNumber(metrics.vehiclesOnline)} />
          <Stat label="Vehicles offline" value={formatNumber(metrics.vehiclesOffline)} />
        </dl>

        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">What to watch for</p>
          <p>
            A traffic spike slows every vehicle on a corridor, which pushes their
            ETAs out, which moves deliveries to <strong>at risk</strong> and then{" "}
            <strong>delayed</strong>, which raises an alert, writes to the
            activity feed and bends the charts. One cause, seven visible effects.
          </p>
          <p>
            Press <kbd className="rounded border border-border bg-muted px-1">Ctrl</kbd>
            +<kbd className="rounded border border-border bg-muted px-1">K</kbd>{" "}
            at any time to search or to fire a scenario by hand.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            onClick={() => {
              if (!running) {
                onStart()
              }
              onDismiss()
            }}
          >
            <PlayIcon aria-hidden="true" />
            {running ? "Continue" : "Begin simulation"}
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Explore first
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Stat({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div>
      <dt className="ops-label">{label}</dt>
      <dd className="ops-figure text-lg leading-none font-semibold">{value}</dd>
    </div>
  )
}
