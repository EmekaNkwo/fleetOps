import { cn } from "@/lib/utils"

type SpinnerSize = "xs" | "sm" | "md" | "lg"

interface SpinnerProps {
  readonly size?: SpinnerSize
  /** Announced to assistive tech. Pass `null` for decorative use. */
  readonly label?: string | null
  readonly className?: string
}

const SIZES: Readonly<Record<SpinnerSize, string>> = {
  xs: "size-3 border",
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-9 border-2",
}

/**
 * The console's one loading indicator.
 *
 * A ring rather than a pulsing skeleton: skeletons imply the shape of what is
 * coming, and here the shape is a dense operational screen that a grey
 * rectangle would misrepresent. The track is drawn at low opacity so the
 * spinner reads as a gauge sweeping round rather than a floating arc.
 *
 * Under `prefers-reduced-motion` the ring stops spinning and settles into a
 * static dashed circle — still visibly a "busy" state, with no rotation.
 */
export function Spinner({ size = "sm", label = "Loading", className }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0", className)}
    >
      <span
        className={cn(
          "animate-spin rounded-full border-current/25 border-t-current",
          "motion-reduce:animate-none motion-reduce:border-dashed motion-reduce:border-current/60",
          SIZES[size]
        )}
      />
    </span>
  )
}

interface LoadingPanelProps {
  readonly message: string
  readonly hint?: string
  readonly className?: string
}

/** Centred spinner for a panel that has nothing to show yet. */
export function LoadingPanel({ message, hint, className }: LoadingPanelProps) {
  return (
    <div
      className={cn(
        "grid size-full min-h-[8rem] place-items-center p-6 text-center",
        className
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" label={message} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{message}</p>
        {hint ? (
          <p className="max-w-[40ch] text-[11px] text-muted-foreground/80">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
