/**
 * CSV serialisation.
 *
 * Pure and synchronous: given columns and rows it returns a string. Nothing
 * here knows about the browser, which is what makes it testable and what keeps
 * the download side effect in one place (`services/export`).
 */

export interface CsvColumn<T> {
  readonly header: string
  /**
   * Returns the cell value. `null` and `undefined` both render as an empty
   * cell rather than the words "null" or "undefined", which is what a
   * spreadsheet expects of a missing value.
   */
  value(row: T): string | number | boolean | null | undefined
}

/**
 * Fields that need quoting, plus the leading characters a spreadsheet will
 * interpret as a formula. Prefixing those with a tab is the standard defence
 * against CSV injection — a cell reading `=cmd|...` must not execute when the
 * exported file is opened.
 */
const MUST_QUOTE = /[",\r\n]/
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function serialiseCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return ""
  }

  const raw = typeof value === "string" ? value : String(value)
  const guarded = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw

  return MUST_QUOTE.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

/** Serialises rows to RFC 4180 CSV with CRLF line endings. */
export function toCsv<T>(
  columns: readonly CsvColumn<T>[],
  rows: readonly T[]
): string {
  const lines: string[] = [
    columns.map((column) => serialiseCell(column.header)).join(","),
  ]

  for (const row of rows) {
    lines.push(columns.map((column) => serialiseCell(column.value(row))).join(","))
  }

  return lines.join("\r\n")
}

/**
 * A filename that sorts chronologically and survives every filesystem.
 *
 * The timestamp is formatted from parts rather than `toISOString` so it carries
 * the operator's local time: a handover file stamped in UTC is read at the
 * wrong hour by the person it was made for.
 */
export function timestampedFilename(prefix: string, at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, "0")

  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`

  return `${prefix}-${stamp}.csv`
}
