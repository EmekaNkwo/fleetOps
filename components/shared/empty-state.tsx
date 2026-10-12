import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
  readonly tone?: "neutral" | "positive" | "warning"
  readonly compact?: boolean
  readonly className?: string
}

const TONE_CLASSES: Readonly<Record<NonNullable<EmptyStateProps["tone"]>, string>> =
  {
    neutral: "text-muted-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
  }

/**
 * Empty states carry meaning in an ops console: "no alerts" is good news,
 * "no results" is a dead end the user needs to escape. The tone and the action
 * slot make that difference explicit instead of showing the same grey box.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className
      )}
    >
      <Icon
        className={cn("size-5", TONE_CLASSES[tone])}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-[46ch] text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
