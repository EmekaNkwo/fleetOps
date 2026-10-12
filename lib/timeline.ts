import type { TimelineEntry, TimelineEntryKind, TimelineEntryState } from "@/types"

/**
 * Ids are derived from the entry's own content rather than a counter.
 *
 * A module-level counter made the generated dataset depend on how many
 * timelines had been built earlier in the process, so regenerating the world
 * produced different ids and "reset restores the original dataset" quietly
 * stopped being true. Content-derived ids are stable across runs.
 */
function hash(value: string): string {
  let h = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16_777_619)
  }
  return (h >>> 0).toString(36)
}

function entryId(
  kind: TimelineEntryKind,
  at: number,
  label: string,
  detail: string | undefined
): string {
  return `tl-${kind}-${hash(`${at}|${label}|${detail ?? ""}`)}`
}

export function timelineEntry(input: {
  readonly kind: TimelineEntryKind
  readonly label: string
  readonly at: number
  readonly detail?: string
  readonly state?: TimelineEntryState
}): TimelineEntry {
  return {
    id: entryId(input.kind, input.at, input.label, input.detail),
    kind: input.kind,
    label: input.label,
    at: input.at,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    state: input.state ?? "done",
  }
}

/**
 * Appends an entry, keeping the list ordered and ensuring only the last
 * non-upcoming entry is marked active. The timeline is append-only history, so
 * earlier entries are demoted to `done` rather than rewritten.
 */
export function appendTimeline(
  timeline: readonly TimelineEntry[],
  entry: TimelineEntry
): TimelineEntry[] {
  const settled = timeline.map((item) =>
    item.state === "active" ? { ...item, state: "done" as const } : item
  )
  const upcoming = settled.filter((item) => item.state === "upcoming")
  const history = settled.filter((item) => item.state !== "upcoming")

  return [...history, entry, ...upcoming]
}

/** Rewrites the trailing "expected arrival" marker after an ETA revision. */
export function reviseArrival(
  timeline: readonly TimelineEntry[],
  etaAt: number
): TimelineEntry[] {
  let replaced = false
  const next = timeline.map((item) => {
    if (item.kind === "arrival" && item.state === "upcoming") {
      replaced = true
      return { ...item, at: etaAt }
    }
    return item
  })

  if (replaced) {
    return next
  }

  return [
    ...next,
    timelineEntry({
      kind: "arrival",
      label: "Arrival at destination",
      at: etaAt,
      state: "upcoming",
    }),
  ]
}

/** Marks every entry settled and appends the delivered marker. */
export function closeTimeline(
  timeline: readonly TimelineEntry[],
  entry: TimelineEntry
): TimelineEntry[] {
  return [
    ...timeline
      .filter((item) => item.state !== "upcoming")
      .map((item) => ({ ...item, state: "done" as const })),
    entry,
  ]
}
