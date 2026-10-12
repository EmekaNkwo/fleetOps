import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.PORT ?? 3210)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

/**
 * End-to-end configuration.
 *
 * The suite runs against a production build: the simulation's timing and the
 * map's render loop behave differently under the dev server's instrumentation,
 * and it is the built artefact a reviewer will actually open.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1_600, height: 950 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        port: PORT,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
      },
})
