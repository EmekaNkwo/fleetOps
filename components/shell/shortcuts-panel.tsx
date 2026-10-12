import { SHORTCUTS, type ShortcutDescription } from "@/hooks"

/** Keyboard reference. Grouped the same way the shortcuts themselves are. */
export function ShortcutsPanel() {
  const groups = SHORTCUTS.reduce<Map<string, ShortcutDescription[]>>(
    (accumulator, shortcut) => {
      const bucket = accumulator.get(shortcut.group) ?? []
      bucket.push(shortcut)
      accumulator.set(shortcut.group, bucket)
      return accumulator
    },
    new Map()
  )

  return (
    <div className="ops-scroll h-full overflow-y-auto p-2.5">
      {[...groups.entries()].map(([group, shortcuts]) => (
        <section key={group} className="mb-3 last:mb-0">
          <h3 className="ops-label mb-1.5">{group}</h3>
          <dl className="space-y-1">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.keys}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {shortcut.label}
                </dt>
                <dd>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
                    {shortcut.keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        Single-key shortcuts are ignored while a text field has focus, so typing
        a search query never triggers an action.
      </p>
    </div>
  )
}
