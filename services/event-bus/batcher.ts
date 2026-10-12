export interface EventBatcher<T> {
  /** Queue an item; a flush is scheduled if one is not already pending. */
  push(item: T): void
  /** Flush immediately, bypassing the schedule. */
  flush(): void
  size(): number
  dispose(): void
}

export interface BatcherOptions<T> {
  readonly onFlush: (items: readonly T[]) => void
  /**
   * Minimum gap between flushes. A frame (~16ms) is the default: it coalesces
   * every event produced within one paint into a single store commit.
   */
  readonly intervalMs?: number
  /** Flush early once the queue reaches this size, to bound memory. */
  readonly maxQueue?: number
  readonly now?: () => number
  readonly schedule?: (callback: () => void, delayMs: number) => number
  readonly cancel?: (handle: number) => void
}

/**
 * Coalesces a stream of events into batches.
 *
 * This is the main defence against render storms: in "fast" mode the engine can
 * emit hundreds of events per second, but subscribers see at most one batch per
 * interval, so React commits once rather than once per event.
 */
export function createEventBatcher<T>(
  options: BatcherOptions<T>
): EventBatcher<T> {
  const {
    onFlush,
    intervalMs = 16,
    maxQueue = 2_000,
    now = () => Date.now(),
    schedule = (callback, delayMs) =>
      setTimeout(callback, delayMs) as unknown as number,
    cancel = (handle) => clearTimeout(handle),
  } = options

  let queue: T[] = []
  let handle: number | null = null
  let lastFlushAt = 0
  let disposed = false

  const flush = (): void => {
    if (handle !== null) {
      cancel(handle)
      handle = null
    }
    if (queue.length === 0) {
      return
    }
    const batch = queue
    queue = []
    lastFlushAt = now()
    onFlush(batch)
  }

  const ensureScheduled = (): void => {
    if (disposed || handle !== null) {
      return
    }
    const elapsed = now() - lastFlushAt
    const delay = Math.max(0, intervalMs - elapsed)
    handle = schedule(() => {
      handle = null
      flush()
    }, delay)
  }

  return {
    push(item) {
      if (disposed) {
        return
      }
      queue.push(item)
      if (queue.length >= maxQueue) {
        flush()
        return
      }
      ensureScheduled()
    },
    flush,
    size: () => queue.length,
    dispose() {
      disposed = true
      if (handle !== null) {
        cancel(handle)
        handle = null
      }
      queue = []
    },
  }
}
