/**
 * Minimal logger. Diagnostics are useful while developing the simulation but
 * must not leak to a production console, so everything below the `error` level
 * is compiled out in production builds.
 */
const isDevelopment = process.env.NODE_ENV !== "production"

export const logger = {
  debug(scope: string, message: string, detail?: unknown): void {
    if (!isDevelopment) {
      return
    }
    console.info(`[${scope}] ${message}`, detail ?? "")
  },
  warn(scope: string, message: string, detail?: unknown): void {
    if (!isDevelopment) {
      return
    }
    console.warn(`[${scope}] ${message}`, detail ?? "")
  },
  error(scope: string, message: string, detail?: unknown): void {
    console.error(`[${scope}] ${message}`, detail ?? "")
  },
}
