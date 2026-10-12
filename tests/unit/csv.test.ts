import { describe, expect, it } from "vitest"
import { toCsv, timestampedFilename, type CsvColumn } from "@/lib/csv"

interface Row {
  readonly name: string
  readonly count: number
  readonly note: string | null
}

const COLUMNS: readonly CsvColumn<Row>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Count", value: (row) => row.count },
  { header: "Note", value: (row) => row.note },
]

describe("toCsv", () => {
  it("writes a header row even with no data", () => {
    expect(toCsv(COLUMNS, [])).toBe("Name,Count,Note")
  })

  it("separates rows with CRLF", () => {
    const csv = toCsv(COLUMNS, [
      { name: "a", count: 1, note: null },
      { name: "b", count: 2, note: null },
    ])

    expect(csv.split("\r\n")).toEqual(["Name,Count,Note", "a,1,", "b,2,"])
  })

  it("renders a missing value as an empty cell, not the word null", () => {
    expect(toCsv(COLUMNS, [{ name: "a", count: 0, note: null }])).toContain("a,0,")
  })

  it("quotes fields containing a comma, quote or newline", () => {
    const csv = toCsv(COLUMNS, [
      { name: 'Lagos, "Ikeja"', count: 1, note: "line\nbreak" },
    ])

    expect(csv).toContain('"Lagos, ""Ikeja"""')
    expect(csv).toContain('"line\nbreak"')
  })

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    const csv = toCsv(COLUMNS, [
      { name: "=1+1", count: 0, note: "@SUM(A1)" },
    ])

    // Prefixed, so the sheet shows the text instead of evaluating it.
    expect(csv).toContain("'=1+1")
    expect(csv).toContain("'@SUM(A1)")
  })

  it("quotes a guarded formula that also contains a comma", () => {
    const csv = toCsv([{ header: "H", value: (row: Row) => row.name }], [
      { name: "=cmd|'/c calc'!A,1", count: 0, note: null },
    ])

    expect(csv).toBe(`H\r\n"'=cmd|'/c calc'!A,1"`)
  })
})

describe("timestampedFilename", () => {
  it("stamps local time so a handover file reads at the right hour", () => {
    const at = new Date(2026, 1, 9, 7, 5).getTime()
    expect(timestampedFilename("fleetops-fleet", at)).toBe(
      "fleetops-fleet-20260209-0705.csv"
    )
  })
})
