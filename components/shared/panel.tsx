import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PanelProps {
  readonly title: string
  readonly subtitle?: string
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly bodyClassName?: string
  /** Rendered as a landmark when the panel is a top-level region. */
  readonly as?: "section" | "aside" | "div"
}

/**
 * The console's one container. Everything is a bordered panel with a dense
 * header — consistency here is what stops a high-density screen reading as
 * clutter.
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  as: Element = "section",
}: PanelProps) {
  return (
    <Element
      aria-label={title}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border border-border bg-card",
        className
      )}
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="ops-label truncate">{title}</h2>
          {subtitle ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-hidden", bodyClassName)}>
        {children}
      </div>
    </Element>
  )
}

interface FieldProps {
  readonly label: string
  readonly value: ReactNode
  readonly hint?: ReactNode
  readonly className?: string
}

/** Label-over-value pair used throughout the detail panels. */
export function Field({ label, value, hint, className }: FieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="ops-label">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{value}</dd>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function FieldGrid({
  children,
  columns = 2,
  className,
}: {
  readonly children: ReactNode
  readonly columns?: 2 | 3
  readonly className?: string
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-4 gap-y-3",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
        className
      )}
    >
      {children}
    </dl>
  )
}

export function SectionHeading({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <h3
      className={cn(
        "ops-label border-b border-border pb-1.5",
        className
      )}
    >
      {children}
    </h3>
  )
}
