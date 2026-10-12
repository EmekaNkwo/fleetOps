"use client"

import { useEffect } from "react"
import {
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToastStore, type Toast, type ToastTone } from "@/stores/toast-store"

const TONE_ICON = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: TriangleAlertIcon,
  error: XCircleIcon,
} as const satisfies Record<ToastTone, typeof InfoIcon>

const TONE_CLASS = {
  info: "text-sky-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
} as const satisfies Record<ToastTone, string>

/**
 * Transient confirmations.
 *
 * `aria-live="polite"` rather than `assertive`: these are receipts for actions
 * the operator just took, so they are already expected. The alert queue owns
 * the interruptive channel.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) {
    return null
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-3 left-1/2 z-[60] flex w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-1.5"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastRow({ toast }: { readonly toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)
  const Icon = TONE_ICON[toast.tone]

  useEffect(() => {
    if (toast.timeoutMs === null) {
      return
    }
    const handle = setTimeout(() => {
      dismiss(toast.id)
    }, toast.timeoutMs)

    return () => {
      clearTimeout(handle)
    }
  }, [toast.id, toast.timeoutMs, dismiss])

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2 rounded border border-border bg-popover px-2.5 py-2 shadow-lg",
        "animate-in duration-150 slide-in-from-bottom-2 motion-reduce:animate-none"
      )}
    >
      <Icon
        className={cn("mt-px size-4 shrink-0", TONE_CLASS[toast.tone])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{toast.message}</p>
        {toast.detail ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{toast.detail}</p>
        ) : null}
      </div>

      {toast.action ? (
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            toast.action?.run()
            dismiss(toast.id)
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
