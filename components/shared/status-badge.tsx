import { cn } from "@/lib/utils"
import {
  DELIVERY_STATUS_TOKENS,
  DRIVER_STATUS_TOKENS,
  INCIDENT_STATUS_TOKENS,
  SEVERITY_TOKENS,
  TRAFFIC_TOKENS,
  VEHICLE_STATUS_TOKENS,
  type StatusToken,
} from "@/lib/status-tokens"
import type {
  DeliveryStatus,
  DriverStatus,
  IncidentStatus,
  Severity,
  TrafficLevel,
  VehicleStatus,
} from "@/types"

interface StatusBadgeProps {
  readonly token: StatusToken
  readonly size?: "sm" | "md"
  readonly showGlyph?: boolean
  readonly className?: string
}

/**
 * Status chip. The glyph is not decoration: it is the redundant encoding that
 * keeps status readable without colour, for colour-blind users and for anyone
 * reading a greyscale screenshot.
 */
function StatusBadge({
  token,
  size = "sm",
  showGlyph = true,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        token.className,
        className
      )}
    >
      {showGlyph ? (
        <span aria-hidden="true" className="text-[9px] leading-none">
          {token.glyph}
        </span>
      ) : null}
      {token.label}
    </span>
  )
}

export function VehicleStatusBadge({
  status,
  ...rest
}: { readonly status: VehicleStatus } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={VEHICLE_STATUS_TOKENS[status]} {...rest} />
}

export function DeliveryStatusBadge({
  status,
  ...rest
}: { readonly status: DeliveryStatus } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={DELIVERY_STATUS_TOKENS[status]} {...rest} />
}

export function DriverStatusBadge({
  status,
  ...rest
}: { readonly status: DriverStatus } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={DRIVER_STATUS_TOKENS[status]} {...rest} />
}

export function SeverityBadge({
  severity,
  ...rest
}: { readonly severity: Severity } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={SEVERITY_TOKENS[severity]} {...rest} />
}

export function IncidentStatusBadge({
  status,
  ...rest
}: { readonly status: IncidentStatus } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={INCIDENT_STATUS_TOKENS[status]} {...rest} />
}

export function TrafficBadge({
  level,
  ...rest
}: { readonly level: TrafficLevel } & Omit<StatusBadgeProps, "token">) {
  return <StatusBadge token={TRAFFIC_TOKENS[level]} {...rest} />
}

/** Bare status dot for use inside dense rows where a chip is too heavy. */
export function StatusDot({
  token,
  className,
}: {
  readonly token: StatusToken
  readonly className?: string
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        token.dotClassName,
        className
      )}
      role="img"
      aria-label={token.label}
      title={token.label}
    />
  )
}
