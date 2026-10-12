"use client"

import { useEffect, useState } from "react"

/**
 * Debounces a rapidly changing value. Global search runs over ~1,700 records,
 * so it is driven from the debounced value rather than every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(value)
    }, delayMs)

    return () => {
      clearTimeout(handle)
    }
  }, [value, delayMs])

  return debounced
}
