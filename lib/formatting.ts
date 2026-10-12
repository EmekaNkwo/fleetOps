import { REGION_BY_ID } from "@/data/geography"
import type { RegionId } from "@/types"

const CLOCK = new Intl.DateTimeFormat("en-NG", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
})

const CLOCK_SECONDS = new Intl.DateTimeFormat("en-NG", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const DATE_SHORT = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  month: "short",
})

const INTEGER = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 })

/** e.g. "10:42 AM" — the form used for ETAs. */
export function formatClock(at: number): string {
  return CLOCK.format(at)
}

/** e.g. "12:42:31" — the form used in the activity feed. */
export function formatTimestamp(at: number): string {
  return CLOCK_SECONDS.format(at)
}

export function formatDateShort(at: number): string {
  return DATE_SHORT.format(at)
}

export function formatNumber(value: number): string {
  return INTEGER.format(value)
}

export function formatSigned(value: number): string {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${INTEGER.format(rounded)}` : INTEGER.format(rounded)
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

export function formatSpeed(kmh: number): string {
  return `${Math.round(kmh)} km/h`
}

export function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${INTEGER.format(km)} km`
}

export function formatMinutes(minutes: number): string {
  const total = Math.round(Math.abs(minutes))
  if (total < 60) {
    return `${total} min`
  }
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Compact relative time: "just now", "4m ago", "2h ago". */
export function formatRelative(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 10) {
    return "just now"
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}

export function formatRegion(region: RegionId | null): string {
  if (!region) {
    return "—"
  }
  return REGION_BY_ID[region]?.name ?? region
}

/** Turns SCREAMING_SNAKE enums into "Title case" labels. */
export function humaniseEnum(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, " ")
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
