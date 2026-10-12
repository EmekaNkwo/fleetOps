"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useIsCompact } from "@/hooks"

interface SlideOverProps {
  readonly open: boolean
  readonly title: string
  readonly subtitle?: string
  readonly badge?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
  onClose(): void
}

/**
 * Non-modal detail panel.
 *
 * Deliberately not a dialog: a dispatcher inspecting a vehicle must still be
 * able to watch the map and the alert queue behind it. On tablet widths there
 * is no room for both, so it becomes a full-screen sheet instead.
 *
 * Focus moves to the panel heading on open so keyboard and screen-reader users
 * land inside it, and Escape is handled by the global shortcut layer.
 */
export function SlideOver({
  open,
  title,
  subtitle,
  badge,
  children,
  footer,
  onClose,
}: SlideOverProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const compact = useIsCompact()

  useEffect(() => {
    if (open) {
      headingRef.current?.focus()
    }
  }, [open, title])

  if (!open) {
    return null
  }

  return (
    <aside
      role="region"
      aria-label={`${title} details`}
      className={cn(
        "z-30 flex flex-col overflow-hidden border-border bg-card",
        "animate-in duration-150 motion-reduce:animate-none",
        compact
          ? "fixed inset-0 slide-in-from-bottom-4"
          // A flex sibling rather than an overlay: a dispatcher often has the
          // alert queue and a vehicle open at once, and one panel obscuring
          // the other is worse than a narrower map.
          : "relative w-[23rem] shrink-0 border-l slide-in-from-right-4"
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="truncate text-sm font-semibold outline-none"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {badge ? <div className="mt-1.5">{badge}</div> : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={`Close ${title} details`}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <div className="ops-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>

      {footer ? (
        <footer className="shrink-0 border-t border-border p-3">{footer}</footer>
      ) : null}
    </aside>
  )
}
