import { createRequire } from "node:module"
import babelParser from "@babel/eslint-parser"
import js from "@eslint/js"
import { globalIgnores } from "eslint/config"
import pluginNext from "@next/eslint-plugin-next"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

const require = createRequire(import.meta.url)

/**
 * Lint configuration for the console.
 *
 * Previously three files across two workspace packages; inlined here now that
 * there is one project to lint. The behaviour is unchanged apart from the
 * Turborepo plugin, which only existed to police `turbo.json` env declarations
 * and has nothing left to check.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),

  js.configs.recommended,
  eslintConfigPrettier,

  {
    languageOptions: {
      // Babel rather than the TypeScript parser: the config is type-aware
      // nowhere, and `tsc --noEmit` is what actually checks types here.
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [require.resolve("@babel/preset-typescript")],
        },
      },
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },

  {
    // Everything is a warning. A lint error that blocks a build teaches people
    // to pass `--no-verify`; a warning that shows up in review does not.
    plugins: { onlyWarn },
  },

  {
    plugins: { "@next/next": pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },

  pluginReactHooks.configs.flat.recommended,
]
