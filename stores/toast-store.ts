import { create } from "zustand"

export type ToastTone = "info" | "success" | "warning" | "error"

export interface ToastAction {
  readonly label: string
  run(): void
}

export interface Toast {
  readonly id: string
  readonly tone: ToastTone
  readonly message: string
  readonly detail?: string
  /** An inline follow-up, used by undo. Running it dismisses the toast. */
  readonly action?: ToastAction
  readonly createdAt: number
  /** Milliseconds before auto-dismissal; `null` waits for the operator. */
  readonly timeoutMs: number | null
}

export interface ToastInput {
  readonly tone?: ToastTone
  readonly message: string
  readonly detail?: string
  readonly action?: ToastAction
  readonly timeoutMs?: number | null
}

interface ToastState {
  readonly toasts: readonly Toast[]
  push(input: ToastInput): string
  dismiss(id: string): void
  clear(): void
}

/**
 * How many are shown at once. A control centre that stacks fifteen
 * confirmations over the map has stopped being a control centre.
 */
const MAX_TOASTS = 4

/** Default dwell. Long enough to read a sentence and reach an Undo button. */
const DEFAULT_TIMEOUT_MS = 6_000

let counter = 0

/**
 * Transient operator feedback.
 *
 * Separate from the alert store on purpose: an alert is operational state that
 * belongs to the fleet and outlives the session, a toast is a receipt for
 * something the operator just did and belongs to the tab. Conflating them puts
 * "Exported 412 rows" in the same queue as "Vehicle 192 is offline".
 */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (input) => {
    counter += 1
    const id = `toast-${counter}`
    const toast: Toast = {
      id,
      tone: input.tone ?? "info",
      message: input.message,
      createdAt: Date.now(),
      timeoutMs: input.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : input.timeoutMs,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
      ...(input.action === undefined ? {} : { action: input.action }),
    }

    set((state) => ({
      // Newest first, oldest dropped — the opposite would hide the message the
      // operator is waiting for behind ones they have already read.
      toasts: [toast, ...state.toasts].slice(0, MAX_TOASTS),
    }))

    return id
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  clear: () => {
    set({ toasts: [] })
  },
}))

/** Imperative entry point for services that are not React components. */
export function notify(input: ToastInput): string {
  return useToastStore.getState().push(input)
}
