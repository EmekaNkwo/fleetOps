/**
 * Narrow, typed wrapper over `localStorage`.
 *
 * Every read is validated by the caller's `parse` function and every failure
 * degrades to the fallback: a user with storage disabled, a quota-exceeded
 * write, or a stale value from an older build must never break the control
 * centre. Writes are no-ops during server rendering.
 */
const STORAGE_PREFIX = "fleetops"

export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}:${name}`
}

function available(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  try {
    const probe = `${STORAGE_PREFIX}:probe`
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

let cachedAvailability: boolean | null = null

function isStorageAvailable(): boolean {
  if (cachedAvailability === null) {
    cachedAvailability = available()
  }
  return cachedAvailability
}

export function readValue<T>(
  name: string,
  parse: (raw: unknown) => T | null,
  fallback: T
): T {
  if (!isStorageAvailable()) {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(storageKey(name))
    if (raw === null) {
      return fallback
    }
    const parsed = parse(JSON.parse(raw) as unknown)
    return parsed === null ? fallback : parsed
  } catch {
    return fallback
  }
}

export function writeValue(name: string, value: unknown): void {
  if (!isStorageAvailable()) {
    return
  }
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(value))
  } catch {
    // Quota exceeded or private-mode restrictions: preferences are a
    // convenience, so dropping the write is the right failure mode.
  }
}

/** Reset for tests. */
export function resetStorageAvailabilityCache(): void {
  cachedAvailability = null
}
