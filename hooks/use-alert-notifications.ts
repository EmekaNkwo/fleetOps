"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  alertNotifier,
  type DesktopPermission,
} from "@/services/notifications/alert-notifier"
import { useAlertStore, useUiStore } from "@/stores"
import type { NotificationPreferences } from "@/services/storage/preferences"

export interface UseAlertNotificationsResult {
  readonly preferences: NotificationPreferences
  readonly soundSupported: boolean
  readonly desktopPermission: DesktopPermission
  readonly desktopBlocked: boolean
  setSound(enabled: boolean): void
  /** Enabling desktop alerts prompts for permission if it has not been asked. */
  enableDesktop(enabled: boolean): Promise<void>
  /** Plays the tone once so the operator can hear what they are enabling. */
  preview(): void
}

/**
 * Out-of-band alerting for escalations.
 *
 * The hook watches the newest open CRITICAL alert rather than subscribing to
 * the event bus, keeping the UI layer on the store side of the architecture
 * boundary. The first observed value is swallowed: an operator opening the
 * console to a board that already has criticals on it should not be greeted by
 * a siren for something that happened before they arrived.
 */
export function useAlertNotifications(): UseAlertNotificationsResult {
  const preferences = useUiStore((state) => state.notifications)
  const setPreference = useUiStore((state) => state.setNotificationPreference)
  const latestCriticalId = useAlertStore((state) => state.latestCriticalId)
  const alertsById = useAlertStore((state) => state.byId)

  const [desktopPermission, setDesktopPermission] =
    useState<DesktopPermission>("default")
  const announcedId = useRef<string | null>(null)
  const primed = useRef(false)

  useEffect(() => {
    setDesktopPermission(alertNotifier.desktopPermission())
  }, [])

  useEffect(() => {
    if (!latestCriticalId) {
      return
    }

    // Swallow whatever was already on the board when the session started.
    if (!primed.current) {
      primed.current = true
      announcedId.current = latestCriticalId
      return
    }

    if (announcedId.current === latestCriticalId) {
      return
    }
    announcedId.current = latestCriticalId

    if (!preferences.sound && !preferences.desktop) {
      return
    }

    const alert = alertsById[latestCriticalId]
    if (!alert) {
      return
    }

    alertNotifier.notify({
      title: alert.title,
      body: alert.message,
      tag: alert.id,
      sound: preferences.sound,
      desktop: preferences.desktop,
    })
  }, [latestCriticalId, alertsById, preferences.sound, preferences.desktop])

  const setSound = useCallback(
    (enabled: boolean): void => {
      // Toggling is a user gesture, which is the only moment a browser will
      // let us create the audio context.
      if (enabled) {
        alertNotifier.unlockAudio()
      }
      setPreference("sound", enabled)
    },
    [setPreference]
  )

  const enableDesktop = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!enabled) {
        setPreference("desktop", false)
        return
      }

      const permission = await alertNotifier.requestDesktopPermission()
      setDesktopPermission(permission)
      setPreference("desktop", permission === "granted")
    },
    [setPreference]
  )

  const preview = useCallback((): void => {
    alertNotifier.unlockAudio()
    alertNotifier.notify({
      title: "FleetOps alert test",
      body: "This is what a critical alert sounds like.",
      tag: "preview",
      sound: true,
      desktop: false,
    })
  }, [])

  return {
    preferences,
    soundSupported: alertNotifier.isSoundSupported(),
    desktopPermission,
    desktopBlocked: desktopPermission === "denied",
    setSound,
    enableDesktop,
    preview,
  }
}
