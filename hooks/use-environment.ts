"use client"

import { useEffect, useState } from "react"
import { operationsNow } from "@/services/simulation/ops-clock"

/** Tracks a media query, SSR-safe. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return
    }

    const list = window.matchMedia(query)
    setMatches(list.matches)

    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches)
    }

    list.addEventListener("change", onChange)
    return () => {
      list.removeEventListener("change", onChange)
    }
  }, [query])

  return matches
}

/** True on tablet-and-below, where the sidebar collapses into a drawer. */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 1023px)")
}

/**
 * Honours the operating system's reduced-motion setting. Motion in this app
 * carries meaning (a marker moving *is* the data), so reduced motion damps
 * decorative transitions while leaving position updates intact.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}

/**
 * A coarse ticking clock for relative timestamps. One shared interval per
 * consumer, deliberately slow: "4m ago" does not need 60fps.
 */
export function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => operationsNow())

  useEffect(() => {
    const handle = setInterval(() => {
      setNow(operationsNow())
    }, intervalMs)

    return () => {
      clearInterval(handle)
    }
  }, [intervalMs])

  return now
}
