"use client"

import { PauseIcon, PlayIcon, RotateCcwIcon, ZapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { RATE_LABELS } from "@/data/config"
import { formatNumber } from "@/lib/formatting"
import type { UseSimulationResult } from "@/hooks"
import type { EventRate, SimulationToggles } from "@/types"

interface SimulationPanelProps {
  readonly simulation: UseSimulationResult
}

const RATES: readonly EventRate[] = ["slow", "normal", "fast"]

const TOGGLE_LABELS: Readonly<
  Record<keyof SimulationToggles, { label: string; hint: string }>
> = {
  randomDelays: {
    label: "Random delays",
    hint: "Halts vehicles en route, which pushes ETAs out",
  },
  vehicleFailures: {
    label: "Vehicle failures",
    hint: "Drops telemetry and opens a mechanical incident",
  },
  trafficSpikes: {
    label: "Traffic spikes",
    hint: "Degrades a corridor and slows every vehicle on it",
  },
  newDeliveries: {
    label: "New deliveries",
    hint: "Dispatches fresh orders to idle vehicles",
  },
  deliveryCompletions: {
    label: "Delivery completions",
    hint: "Closes deliveries out on arrival",
  },
}

/**
 * Simulation console. The one place in the UI that exposes the engine, and even
 * here it does so through `useSimulation` rather than touching it directly.
 */
export function SimulationPanel({ simulation }: SimulationPanelProps) {
  return (
    <div className="ops-scroll flex h-full min-h-0 flex-col overflow-y-auto">
      <section className="space-y-2.5 border-b border-border p-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            variant={simulation.running ? "outline" : "default"}
            size="sm"
            className="flex-1"
            onClick={simulation.toggle}
          >
            {simulation.running ? (
              <PauseIcon aria-hidden="true" />
            ) : (
              <PlayIcon aria-hidden="true" />
            )}
            {simulation.running ? "Pause simulation" : "Start simulation"}
          </Button>
          <Button variant="outline" size="sm" onClick={simulation.reset}>
            <RotateCcwIcon aria-hidden="true" />
            Reset
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="ops-label">Ticks</dt>
            <dd className="ops-figure text-sm font-medium">
              {formatNumber(simulation.status.tick)}
            </dd>
          </div>
          <div>
            <dt className="ops-label">Events</dt>
            <dd className="ops-figure text-sm font-medium">
              {formatNumber(simulation.status.eventsEmitted)}
            </dd>
          </div>
          <div>
            <dt className="ops-label">State</dt>
            <dd className="text-sm font-medium">
              {simulation.running ? "Running" : "Paused"}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted-foreground">
          Resetting restores the original seeded dataset exactly — the same 520
          vehicles, 680 deliveries and opening incident board.
        </p>
      </section>

      <section className="space-y-2 border-b border-border p-2.5">
        <h3 className="ops-label">Event rate</h3>
        <div
          className="grid grid-cols-3 gap-1"
          role="radiogroup"
          aria-label="Simulation event rate"
        >
          {RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              role="radio"
              aria-checked={simulation.rate === rate}
              onClick={() => simulation.setRate(rate)}
              className={cn(
                "rounded border px-2 py-1.5 text-left transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                simulation.rate === rate
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent"
              )}
            >
              <span className="block text-xs font-medium capitalize">{rate}</span>
              <span className="block text-[10px] text-muted-foreground">
                {RATE_LABELS[rate]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-1 border-b border-border p-2.5">
        <h3 className="ops-label mb-1">Scenarios</h3>
        {(
          Object.keys(TOGGLE_LABELS) as readonly (keyof SimulationToggles)[]
        ).map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-start justify-between gap-3 rounded py-1.5"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                {TOGGLE_LABELS[key].label}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {TOGGLE_LABELS[key].hint}
              </span>
            </span>
            <Switch
              checked={simulation.toggles[key]}
              onCheckedChange={(checked) => simulation.setToggle(key, checked)}
              aria-label={TOGGLE_LABELS[key].label}
            />
          </label>
        ))}
      </section>

      <section className="space-y-1.5 p-2.5">
        <h3 className="ops-label">Inject an event now</h3>
        <p className="text-[11px] text-muted-foreground">
          Fire a scenario by hand and watch it propagate through the map, the
          board, the alert queue and the charts.
        </p>
        <div className="space-y-1 pt-1">
          {simulation.scenarios.map((scenario) => (
            <Button
              key={scenario.kind}
              variant="outline"
              size="xs"
              className="w-full justify-start"
              onClick={() => simulation.injectScenario(scenario.kind)}
              title={scenario.description}
            >
              <ZapIcon aria-hidden="true" />
              {scenario.label}
            </Button>
          ))}
        </div>
      </section>

      {simulation.processingErrors > 0 ? (
        <p
          role="status"
          className="m-2.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
        >
          {simulation.processingErrors} event
          {simulation.processingErrors === 1 ? "" : "s"} failed to process.
          {simulation.lastErrorMessage
            ? ` Most recent: ${simulation.lastErrorMessage}`
            : ""}
        </p>
      ) : null}
    </div>
  )
}
