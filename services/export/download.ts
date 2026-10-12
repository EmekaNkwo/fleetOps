/**
 * The one place a file leaves the application.
 *
 * Isolated for the same reason `services/storage` is: components ask for an
 * export, they do not know that an object URL gets created and revoked, and a
 * browser that blocks the download must not take a panel down with it.
 */
import { logger } from "@/lib/logger"

/**
 * Excel reads a UTF-8 CSV as the system codepage unless it finds a byte order
 * mark, which turns every Nigerian place name with an accent into mojibake.
 */
const BOM = "﻿"

export interface DownloadResult {
  readonly ok: boolean
  readonly reason?: string
}

export function downloadCsv(filename: string, content: string): DownloadResult {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return { ok: false, reason: "Downloads are unavailable in this environment." }
  }

  let url: string | null = null
  try {
    const blob = new Blob([BOM, content], {
      type: "text/csv;charset=utf-8",
    })
    url = URL.createObjectURL(blob)

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.rel = "noopener"
    anchor.style.display = "none"

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    return { ok: true }
  } catch (error: unknown) {
    logger.error("export", "download failed", error)
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "The download failed.",
    }
  } finally {
    if (url !== null) {
      // Revoking immediately is safe: the click has already handed the blob to
      // the download manager. Holding the URL leaks the whole file.
      URL.revokeObjectURL(url)
    }
  }
}
