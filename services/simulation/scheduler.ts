/**
 * Minimal interval scheduler.
 *
 * The engine runs two independent cadences — continuous position integration
 * and discrete operational events — and they must be able to change rate
 * without disturbing each other. Timers are injectable so tests drive the
 * simulation by hand instead of waiting on real clocks.
 */
export interface SchedulerTimers {
  readonly setInterval: (callback: () => void, ms: number) => number
  readonly clearInterval: (handle: number) => void
  readonly now: () => number
}

export const realTimers: SchedulerTimers = {
  setInterval: (callback, ms) =>
    setInterval(callback, ms) as unknown as number,
  clearInterval: (handle) => {
    clearInterval(handle)
  },
  now: () => Date.now(),
}

export interface ScheduledTask {
  readonly name: string
  readonly intervalMs: number
  readonly run: (elapsedMs: number) => void
}

export interface Scheduler {
  /** Registers (or replaces) a task and starts it if the scheduler is running. */
  set(task: ScheduledTask): void
  /** Changes a task's interval, preserving its handler. */
  retime(name: string, intervalMs: number): void
  remove(name: string): void
  start(): void
  stop(): void
  isRunning(): boolean
  /** Drives a single task manually — the hook tests rely on this. */
  step(name: string, elapsedMs: number): void
}

export function createScheduler(
  timers: SchedulerTimers = realTimers
): Scheduler {
  const tasks = new Map<string, ScheduledTask>()
  const handles = new Map<string, number>()
  const lastRunAt = new Map<string, number>()
  let running = false

  const startTask = (task: ScheduledTask): void => {
    const existing = handles.get(task.name)
    if (existing !== undefined) {
      timers.clearInterval(existing)
    }

    lastRunAt.set(task.name, timers.now())
    const handle = timers.setInterval(() => {
      const previous = lastRunAt.get(task.name) ?? timers.now()
      const current = timers.now()
      lastRunAt.set(task.name, current)
      // Clamp the delta: a backgrounded tab can accumulate minutes of drift,
      // and replaying it in one step would teleport the entire fleet.
      const elapsed = Math.min(
        task.intervalMs * 4,
        Math.max(1, current - previous)
      )
      task.run(elapsed)
    }, task.intervalMs)

    handles.set(task.name, handle)
  }

  const stopTask = (name: string): void => {
    const handle = handles.get(name)
    if (handle !== undefined) {
      timers.clearInterval(handle)
      handles.delete(name)
    }
  }

  return {
    set(task) {
      tasks.set(task.name, task)
      if (running) {
        startTask(task)
      }
    },

    retime(name, intervalMs) {
      const task = tasks.get(name)
      if (!task || task.intervalMs === intervalMs) {
        return
      }
      const next: ScheduledTask = { ...task, intervalMs }
      tasks.set(name, next)
      if (running) {
        startTask(next)
      }
    },

    remove(name) {
      stopTask(name)
      tasks.delete(name)
      lastRunAt.delete(name)
    },

    start() {
      if (running) {
        return
      }
      running = true
      for (const task of tasks.values()) {
        startTask(task)
      }
    },

    stop() {
      running = false
      for (const name of [...handles.keys()]) {
        stopTask(name)
      }
    },

    isRunning: () => running,

    step(name, elapsedMs) {
      tasks.get(name)?.run(elapsedMs)
    },
  }
}
