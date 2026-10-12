"use client"

import { DownloadIcon } from "lucide-react"
import { Menu } from "@/components/shared/menu"
import { useExport } from "@/hooks"
import { useToastStore } from "@/stores/toast-store"

/**
 * Export entry point.
 *
 * The menu is the only place that knows a CSV is involved; `useExport` owns
 * what a dataset contains and `services/export` owns how a file leaves the
 * browser. The operator gets a receipt either way — a download that silently
 * does nothing is the worst outcome, because there is no failure to report and
 * no file to find.
 */
export function ExportMenu() {
  const { datasets, exportDataset } = useExport()
  const push = useToastStore((state) => state.push)

  return (
    <Menu
      label="Export data"
      trigger={<DownloadIcon aria-hidden="true" />}
      items={datasets.map((dataset) => ({
        id: dataset.id,
        label: dataset.label,
        hint: dataset.hint,
        onSelect: () => {
          const outcome = exportDataset(dataset.id)
          push(
            outcome.ok
              ? {
                  tone: "success",
                  message: `Exported ${outcome.rowCount} ${dataset.label.toLowerCase()} rows`,
                  detail: outcome.filename,
                }
              : {
                  tone: "error",
                  message: "Export failed",
                  detail: outcome.reason ?? "The file could not be created.",
                }
          )
        },
      }))}
    />
  )
}
