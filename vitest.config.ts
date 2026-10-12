import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Playwright owns `tests/e2e`; Vitest must not try to run those specs.
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/ui/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html"],
      // Coverage targets the business layer. Presentation is covered by the
      // UI and end-to-end tests, where behaviour matters more than lines.
      include: [
        "lib/**/*.ts",
        "services/**/*.ts",
        "stores/**/*.ts",
        "hooks/**/*.ts",
      ],
      exclude: ["**/index.ts", "lib/logger.ts"],
      thresholds: {
        statements: 70,
        functions: 70,
        lines: 70,
        // Branches sit lower by design. A large share of the remaining
        // uncovered branches are defensive guards for states the type system
        // already rules out — `?? fallback` on a non-null map lookup, or a
        // null check on a record that was just written. Writing tests to force
        // those paths would assert that unreachable code is unreachable.
        branches: 65,
      },
    },
  },
})
