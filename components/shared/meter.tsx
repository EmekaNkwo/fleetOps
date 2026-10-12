import { cn } from "@/lib/utils"

interface MeterProps {
  readonly label: string
  readonly fraction: number
  readonly display: string
  readonly tone?: "default" | "good" | "warn" | "bad"
  readonly segments?: number
  readonly className?: string
}

const TONE_CLASSES: Readonly<Record<NonNullable<MeterProps["tone"]>, string>> = {
  default: "bg-primary",
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  bad: "bg-red-500",
}

/**
 * Segmented bar meter. Blocks rather than a smooth fill: they read as a
 * discrete gauge at a glance and stay legible at 20px tall, which is the kind
 * of density this screen needs.
 */
export function Meter({
  label,
  fraction,
  display,
  tone = "default",
  segments = 20,
  className,
}: MeterProps) {
  const clamped = Math.max(0, Math.min(1, fraction))
  const filled = Math.round(clamped * segments)
  const percent = Math.round(clamped * 100)

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="ops-label truncate">{label}</span>
        <span className="ops-figure text-sm font-medium">{display}</span>
      </div>
      <div
        className="mt-1.5 flex gap-px"
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={display}
      >
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              "h-2 flex-1 rounded-[1px]",
              index < filled ? TONE_CLASSES[tone] : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  )
}

/** Thin inline progress rail used in table rows and detail panels. */
export function ProgressRail({
  fraction,
  label,
  className,
}: {
  readonly fraction: number
  readonly label: string
  readonly className?: string
}) {
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100)

  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
