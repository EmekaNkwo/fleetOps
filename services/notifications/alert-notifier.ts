import { logger } from "@/lib/logger"

export type DesktopPermission = NotificationPermission | "unsupported"

export interface NotifyInput {
  readonly title: string
  readonly body: string
  readonly tag: string
  readonly sound: boolean
  readonly desktop: boolean
}

export interface AlertNotifier {
  /** Whether this browser can play the alert tone at all. */
  isSoundSupported(): boolean
  desktopPermission(): DesktopPermission
  requestDesktopPermission(): Promise<DesktopPermission>
  /** Must be called from a user gesture before the first tone. */
  unlockAudio(): void
  notify(input: NotifyInput): void
  dispose(): void
}

/** Minimum gap between audible or desktop alerts, in milliseconds. */
const THROTTLE_MS = 6_000

/**
 * Out-of-band alerting for escalations.
 *
 * A control room cannot depend on someone watching a badge, so CRITICAL alerts
 * can also reach the operator through the speakers and the OS. Both channels
 * are off by default and opt-in: unsolicited noise and notification spam are
 * worse than no alerting at all.
 */
export function createAlertNotifier(): AlertNotifier {
  let context: AudioContext | null = null
  let lastFiredAt = 0
  let disposed = false

  const audioSupported = (): boolean =>
    typeof window !== "undefined" &&
    ("AudioContext" in window || "webkitAudioContext" in window)

  const ensureContext = (): AudioContext | null => {
    if (disposed || !audioSupported()) {
      return null
    }
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) {
        return null
      }
      context = new Ctor()
    }
    // Browsers suspend contexts created outside a gesture; resuming is a no-op
    // when it is already running.
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined)
    }
    return context
  }

  /**
   * A two-tone chirp rather than a sample: no asset to ship, no licence to
   * worry about, and it cuts through ambient noise without being a siren.
   */
  const playTone = (): void => {
    const ctx = ensureContext()
    if (!ctx) {
      return
    }

    try {
      const now = ctx.currentTime
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)

      for (const [frequency, offset] of [
        [880, 0],
        [660, 0.18],
      ] as const) {
        const oscillator = ctx.createOscillator()
        oscillator.type = "triangle"
        oscillator.frequency.setValueAtTime(frequency, now + offset)
        oscillator.connect(gain)
        oscillator.start(now + offset)
        oscillator.stop(now + offset + 0.16)
      }
    } catch (error) {
      logger.warn("notifier", "could not play the alert tone", error)
    }
  }

  const permission = (): DesktopPermission =>
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission

  return {
    isSoundSupported: audioSupported,

    desktopPermission: permission,

    async requestDesktopPermission() {
      if (permission() === "unsupported") {
        return "unsupported"
      }
      try {
        return await Notification.requestPermission()
      } catch (error) {
        logger.warn("notifier", "permission request failed", error)
        return Notification.permission
      }
    },

    unlockAudio() {
      ensureContext()
    },

    notify(input) {
      if (disposed) {
        return
      }

      // One escalation at a time. A burst of failures must not become a burst
      // of beeps.
      const now = Date.now()
      if (now - lastFiredAt < THROTTLE_MS) {
        return
      }
      lastFiredAt = now

      if (input.sound) {
        playTone()
      }

      // Only notify when the console is not on screen: if the operator is
      // looking at the alert centre, a duplicate OS popup is just noise.
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden"

      if (input.desktop && hidden && permission() === "granted") {
        try {
          const notification = new Notification(input.title, {
            body: input.body,
            tag: input.tag,
            silent: input.sound,
          })
          notification.onclick = () => {
            window.focus()
            notification.close()
          }
        } catch (error) {
          logger.warn("notifier", "could not raise a notification", error)
        }
      }
    },

    dispose() {
      disposed = true
      void context?.close().catch(() => undefined)
      context = null
    },
  }
}

/** Shared instance used by the running application. */
export const alertNotifier: AlertNotifier = createAlertNotifier()
