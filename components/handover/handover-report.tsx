"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { PrinterIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { IncidentStatusBadge, SeverityBadge } from "@/components/shared/status-badge"
import { formatTimestamp, humaniseEnum } from "@/lib/formatting"
import { handoverRegionName, useHandover } from "@/hooks/use-handover"

export interface HandoverReportProps {
  onClose(): void
}

/**
 * Shift handover.
 *
 * A dialog rather than a tab, because it is a thing you produce at a moment —
 * the end of a shift — not a surface you live in. It is laid out for paper
 * first: the print styles drop the chrome and the scroll container so the page
 * breaks naturally, which is what the incoming operator will actually be
 * holding.
 */
export function HandoverReport({ onClose }: HandoverReportProps) {
  const { report, print } = useHandover()
  const [mounted, setMounted] = useState(false)

  // Portalled to `body` so the print rules can hide the console by hiding
  // `body`'s other children. Rendered inside the shell it would inherit the
  // full-height, overflow-hidden layout and print as a single clipped page.
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shift handover report"
      className="ops-print-root fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 print:hidden"
        onClick={onClose}
      />

      <article
        className={cn(
          "ops-report relative flex max-h-full w-full max-w-3xl flex-col rounded border border-border bg-card shadow-xl",
          "print:max-h-none print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-3 print:border-b-2">
          <div>
            <h2 className="text-sm font-semibold">Shift handover</h2>
            <p className="ops-figure mt-0.5 text-[11px] text-muted-foreground">
              FleetOps Command Centre · {formatTimestamp(report.generatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <Button variant="outline" size="xs" onClick={print}>
              <PrinterIcon aria-hidden="true" />
              Print
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close handover report"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="ops-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3 print:overflow-visible">
          <div className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
            {report.sections.map((section) => (
              <section key={section.title}>
                <h3 className="ops-label mb-1.5 border-b border-border pb-1">
                  {section.title}
                </h3>
                <dl className="space-y-1">
                  {section.lines.map((line) => (
                    <div
                      key={line.label}
                      className="flex items-baseline justify-between gap-2 text-[11px]"
                    >
                      <dt className="text-muted-foreground">{line.label}</dt>
                      <dd
                        className={cn(
                          "ops-figure font-semibold",
                          line.tone === "good" && "text-emerald-600 dark:text-emerald-400",
                          line.tone === "warn" && "text-orange-600 dark:text-orange-400",
                          line.tone === "bad" && "text-red-600 dark:text-red-400"
                        )}
                      >
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <section>
            <h3 className="ops-label mb-1.5 border-b border-border pb-1">
              Open incidents ({report.openIncidents.length})
            </h3>
            {report.openIncidents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nothing open. The board is clear.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {report.openIncidents.map((incident) => (
                  <li key={incident.id} className="text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="ops-figure font-semibold">
                        {incident.reference}
                      </span>
                      <IncidentStatusBadge status={incident.status} />
                      <SeverityBadge severity={incident.severity} />
                      <span className="text-muted-foreground">
                        {humaniseEnum(incident.type)} ·{" "}
                        {handoverRegionName(incident.region)}
                      </span>
                    </div>
                    <p className="mt-0.5">{incident.title}</p>
                    <p className="text-muted-foreground">
                      {incident.assignee
                        ? `Owned by ${incident.assignee}.`
                        : "Unassigned — needs an owner."}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="ops-label mb-1.5 border-b border-border pb-1">
              Unacknowledged critical alerts ({report.criticalAlerts.length})
            </h3>
            {report.criticalAlerts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                None outstanding.
              </p>
            ) : (
              <ul className="space-y-1">
                {report.criticalAlerts.map((alert) => (
                  <li key={alert.id} className="text-[11px]">
                    <span className="font-medium">{alert.title}</span>
                    <span className="text-muted-foreground"> — {alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="ops-label mb-1.5 border-b border-border pb-1">
              Corridors to watch
            </h3>
            {report.watchList.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No corridor is carrying late work.
              </p>
            ) : (
              <ul className="list-inside list-disc space-y-0.5 text-[11px]">
                {report.watchList.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            )}
          </section>

          <footer className="border-t border-border pt-2 text-[10px] text-muted-foreground">
            Generated from live operations data at the time shown. Figures move
            as the simulation runs — reprint if the handover is delayed.
          </footer>
        </div>
      </article>
    </div>,
    document.body
  )
}
