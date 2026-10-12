import type {
  DeliveryStatus,
  DriverStatus,
  IncidentStatus,
  Severity,
  TrafficLevel,
  VehicleStatus,
} from "@/types"

/**
 * Single source of truth for how operational state is presented. Keeping these
 * tokens in one place means the canvas map, the badges and the charts cannot
 * drift apart, and it is where the "never rely on colour alone" rule is
 * enforced: every token carries a glyph and a short code as well as a hue.
 */
export interface StatusToken {
  readonly label: string
  /** 3-letter code shown in dense tables and on map markers. */
  readonly code: string
  /** Shape/character cue so status survives greyscale and colour blindness. */
  readonly glyph: string
  readonly className: string
  readonly dotClassName: string
  /** Raw colour for canvas rendering, where Tailwind classes cannot reach. */
  readonly canvas: string
}

export const VEHICLE_STATUS_TOKENS: Readonly<
  Record<VehicleStatus, StatusToken>
> = {
  ON_ROUTE: {
    label: "On Route",
    code: "ONR",
    glyph: "▲",
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    canvas: "#10b981",
  },
  IDLE: {
    label: "Idle",
    code: "IDL",
    glyph: "■",
    className: "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/30",
    dotClassName: "bg-sky-500",
    canvas: "#0ea5e9",
  },
  DELAYED: {
    label: "Delayed",
    code: "DLY",
    glyph: "◆",
    className:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 border-orange-500/30",
    dotClassName: "bg-orange-500",
    canvas: "#f97316",
  },
  AT_RISK: {
    label: "At Risk",
    code: "RSK",
    glyph: "▼",
    className:
      "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/30",
    dotClassName: "bg-amber-400",
    canvas: "#fbbf24",
  },
  OFFLINE: {
    label: "Offline",
    code: "OFF",
    glyph: "✕",
    className: "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30",
    dotClassName: "bg-red-500",
    canvas: "#ef4444",
  },
  DELIVERED: {
    label: "Delivered",
    code: "DLV",
    glyph: "✓",
    className:
      "text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30",
    dotClassName: "bg-teal-500",
    canvas: "#14b8a6",
  },
}

export const DELIVERY_STATUS_TOKENS: Readonly<
  Record<DeliveryStatus, StatusToken>
> = {
  PENDING: {
    label: "Pending",
    code: "PND",
    glyph: "○",
    className:
      "text-slate-700 dark:text-slate-300 bg-slate-500/10 border-slate-500/30",
    dotClassName: "bg-slate-400",
    canvas: "#94a3b8",
  },
  ASSIGNED: {
    label: "Assigned",
    code: "ASG",
    glyph: "◐",
    className:
      "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border-indigo-500/30",
    dotClassName: "bg-indigo-500",
    canvas: "#6366f1",
  },
  IN_TRANSIT: {
    label: "In Transit",
    code: "TRN",
    glyph: "▲",
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    canvas: "#10b981",
  },
  DELAYED: {
    label: "Delayed",
    code: "DLY",
    glyph: "◆",
    className:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 border-orange-500/30",
    dotClassName: "bg-orange-500",
    canvas: "#f97316",
  },
  AT_RISK: {
    label: "At Risk",
    code: "RSK",
    glyph: "▼",
    className:
      "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/30",
    dotClassName: "bg-amber-400",
    canvas: "#fbbf24",
  },
  COMPLETED: {
    label: "Completed",
    code: "CPL",
    glyph: "✓",
    className:
      "text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30",
    dotClassName: "bg-teal-500",
    canvas: "#14b8a6",
  },
  CANCELLED: {
    label: "Cancelled",
    code: "CNL",
    glyph: "✕",
    className:
      "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
    dotClassName: "bg-zinc-500",
    canvas: "#71717a",
  },
}

export const SEVERITY_TOKENS: Readonly<Record<Severity, StatusToken>> = {
  INFO: {
    label: "Attention",
    code: "INF",
    glyph: "●",
    className: "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/30",
    dotClassName: "bg-sky-500",
    canvas: "#0ea5e9",
  },
  WARNING: {
    label: "Warning",
    code: "WRN",
    glyph: "▲",
    className:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 border-orange-500/30",
    dotClassName: "bg-orange-500",
    canvas: "#f97316",
  },
  CRITICAL: {
    label: "Critical",
    code: "CRT",
    glyph: "✕",
    className: "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30",
    dotClassName: "bg-red-500",
    canvas: "#ef4444",
  },
}

export const INCIDENT_STATUS_TOKENS: Readonly<
  Record<IncidentStatus, StatusToken>
> = {
  DETECTED: {
    label: "Detected",
    code: "DET",
    glyph: "●",
    className: "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30",
    dotClassName: "bg-red-500",
    canvas: "#ef4444",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged",
    code: "ACK",
    glyph: "◐",
    className:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 border-orange-500/30",
    dotClassName: "bg-orange-500",
    canvas: "#f97316",
  },
  INVESTIGATING: {
    label: "Investigating",
    code: "INV",
    glyph: "◑",
    className:
      "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/30",
    dotClassName: "bg-amber-400",
    canvas: "#fbbf24",
  },
  RESOLVED: {
    label: "Resolved",
    code: "RES",
    glyph: "✓",
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    canvas: "#10b981",
  },
}

export const TRAFFIC_TOKENS: Readonly<Record<TrafficLevel, StatusToken>> = {
  normal: {
    label: "Free flowing",
    code: "NRM",
    glyph: "●",
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    canvas: "#10b981",
  },
  slow: {
    label: "Slow moving",
    code: "SLW",
    glyph: "▲",
    className:
      "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/30",
    dotClassName: "bg-amber-400",
    canvas: "#fbbf24",
  },
  congested: {
    label: "Congested",
    code: "CNG",
    glyph: "✕",
    className: "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30",
    dotClassName: "bg-red-500",
    canvas: "#ef4444",
  },
}

export const DRIVER_STATUS_TOKENS: Readonly<Record<DriverStatus, StatusToken>> = {
  ON_DUTY: {
    label: "On duty",
    code: "DTY",
    glyph: "▲",
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    canvas: "#10b981",
  },
  ON_BREAK: {
    label: "On break",
    code: "BRK",
    glyph: "■",
    className:
      "text-amber-700 dark:text-amber-300 bg-amber-400/10 border-amber-400/30",
    dotClassName: "bg-amber-400",
    canvas: "#fbbf24",
  },
  OFF_DUTY: {
    label: "Off duty",
    code: "OFF",
    glyph: "○",
    className: "text-muted-foreground bg-muted border-border",
    dotClassName: "bg-muted-foreground",
    canvas: "#94a3b8",
  },
  UNREACHABLE: {
    label: "Unreachable",
    code: "UNR",
    glyph: "✕",
    className: "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30",
    dotClassName: "bg-red-500",
    canvas: "#ef4444",
  },
}

export const DRIVER_STATUS_ORDER: readonly DriverStatus[] = [
  "ON_DUTY",
  "ON_BREAK",
  "OFF_DUTY",
  "UNREACHABLE",
]

export const VEHICLE_STATUS_ORDER: readonly VehicleStatus[] = [
  "ON_ROUTE",
  "AT_RISK",
  "DELAYED",
  "OFFLINE",
  "IDLE",
  "DELIVERED",
]

export const DELIVERY_STATUS_ORDER: readonly DeliveryStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_TRANSIT",
  "AT_RISK",
  "DELAYED",
  "COMPLETED",
  "CANCELLED",
]

export const SEVERITY_ORDER: readonly Severity[] = [
  "CRITICAL",
  "WARNING",
  "INFO",
]

/** Higher wins when sorting alerts and incidents by urgency. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
}
