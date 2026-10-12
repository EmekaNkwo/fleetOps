"use client"

import { ServerCrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/shared/spinner"
import { formatNumber } from "@/lib/formatting"
import type { BootstrapProgress } from "@/hooks"

interface BootstrapLoadingProps {
  readonly progress: BootstrapProgress
}

/**
 * The cold-start screen.
 *
 * It reports a real fraction, not a decorative animation: the gateway hands
 * back collection totals before the pages start arriving, so the bar is driven
 * by records actually received. A spinner alone would be honest about "working"
 * and dishonest about "nearly done".
 */
export function BootstrapLoading({ progress }: BootstrapLoadingProps) {
  const percent = Math.round(progress.fraction * 100)

  return (
    <div className="ops-sunken grid h-dvh place-items-center">
      <div
        className="w-full max-w-sm space-y-4 px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded bg-primary text-xs font-bold tracking-tight text-primary-foreground"
          >
            FO
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">FleetOps Command Center</p>
            <p className="text-[11px] text-muted-foreground">
              Operations gateway
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Spinner size="sm" label={null} className="text-primary" />
          <p className="text-xs text-muted-foreground">{progress.stage}…</p>
        </div>

        <div>
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Loading operational data"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="ops-figure mt-1.5 text-center text-[11px] text-muted-foreground">
            {percent}%
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <CountRow
            label="Vehicles"
            loaded={progress.vehiclesLoaded}
            total={progress.vehiclesTotal}
          />
          <CountRow
            label="Deliveries"
            loaded={progress.deliveriesLoaded}
            total={progress.deliveriesTotal}
          />
        </dl>
      </div>
    </div>
  )
}

function CountRow({
  label,
  loaded,
  total,
}: {
  readonly label: string
  readonly loaded: number
  readonly total: number
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ops-figure">
        {formatNumber(loaded)}
        <span className="text-muted-foreground"> / {formatNumber(total)}</span>
      </dd>
    </div>
  )
}

interface BootstrapErrorProps {
  readonly message: string
  onRetry(): void
}

/** Shown when the mock gateway fails, so the error path is real, not theatre. */
export function BootstrapError({ message, onRetry }: BootstrapErrorProps) {
  return (
    <div className="ops-sunken grid h-dvh place-items-center">
      <div className="w-full max-w-sm space-y-3 px-6 text-center" role="alert">
        <ServerCrashIcon
          className="mx-auto size-6 text-red-500"
          aria-hidden="true"
        />
        <h1 className="text-sm font-semibold">
          Could not load the operations snapshot
        </h1>
        <p className="text-xs text-muted-foreground">{message}</p>
        <p className="text-[11px] text-muted-foreground">
          No operational data is available, so the console cannot be shown.
          Nothing has been lost — retrying re-requests the pages that failed.
        </p>
        <Button size="sm" onClick={onRetry}>
          Retry connection
        </Button>
      </div>
    </div>
  )
}
