"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatMinutes } from "@/lib/formatting"
import { useReplay } from "@/hooks/use-replay"

/**
 * The review scrubber.
 *
 * Shown only while reviewing, as a band across the top of the workspace. It is
 * deliberately loud: every other surface below it is showing historical data,
 * and an operator who forgets that will act on a board that is minutes stale.
 */
export function ReplayBar() {
  const replay = useReplay()

  if (!replay.reviewing || replay.index === null) {
    return null
  }

  const last = replay.frames.length - 1

  return (
    <div
      role="region"
      aria-label="Replay review"
      className="flex h-9 shrink-0 items-center gap-2 border-b border-amber-500/50 bg-amber-500/15 px-2"
    >
      <HistoryIcon
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
        Reviewing
      </span>
      <span className="ops-figure shrink-0 text-[11px] text-amber-700/90 dark:text-amber-300/90">
        {replay.current?.label} ·{" "}
        {replay.minutesBack < 1
          ? "just now"
          : `${formatMinutes(replay.minutesBack)} back`}
      </span>

      <Button
        variant="outline"
        size="icon-xs"
        className="ml-auto"
        disabled={replay.index === 0}
        onClick={() => replay.scrubTo((replay.index ?? 0) - 1)}
        aria-label="Previous snapshot"
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>

      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={replay.index}
        onChange={(event) => replay.scrubTo(Number(event.target.value))}
        aria-label="Snapshot position"
        aria-valuetext={`${replay.current?.label ?? ""}, snapshot ${replay.index + 1} of ${replay.frames.length}`}
        className="h-1.5 w-40 accent-amber-500 md:w-64"
      />

      <Button
        variant="outline"
        size="icon-xs"
        disabled={replay.index >= last}
        onClick={() => replay.scrubTo((replay.index ?? 0) + 1)}
        aria-label="Next snapshot"
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>

      <Button variant="default" size="xs" onClick={replay.exit}>
        <XIcon aria-hidden="true" />
        Return to live
      </Button>
    </div>
  )
}
