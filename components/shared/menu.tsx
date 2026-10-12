"use client"

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface MenuItem {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly icon?: ReactNode
  readonly disabled?: boolean
  readonly destructive?: boolean
  onSelect(): void
}

interface MenuProps {
  readonly label: string
  readonly trigger: ReactNode
  readonly items: readonly MenuItem[]
  readonly align?: "start" | "end"
  readonly triggerVariant?: "ghost" | "outline"
  readonly triggerSize?: "xs" | "sm" | "icon-sm"
  readonly className?: string
}

/**
 * A small roving-focus dropdown.
 *
 * Written rather than installed: the component library here carries a button,
 * a dialog and a switch, and pulling a whole menu primitive in for four call
 * sites would be more dependency than behaviour. The behaviour that matters is
 * the keyboard contract — arrows move, Home/End jump, Escape closes and
 * returns focus, Tab closes — and that is what this implements.
 */
export function Menu({
  label,
  trigger,
  items,
  align = "end",
  triggerVariant = "ghost",
  triggerSize = "icon-sm",
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const close = useCallback(
    (returnFocus: boolean): void => {
      setOpen(false)
      if (returnFocus) {
        triggerRef.current?.focus()
      }
    },
    []
  )

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    // Capture phase: a click-away must close even when the thing underneath
    // stops propagation, which the map layer does.
    document.addEventListener("pointerdown", onPointerDown, true)

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      itemRefs.current[activeIndex]?.focus()
    }
  }, [open, activeIndex])

  const openAt = (index: number): void => {
    setActiveIndex(index)
    setOpen(true)
  }

  const move = (delta: number): void => {
    setActiveIndex((current) => {
      const next = current + delta
      if (next < 0) {
        return items.length - 1
      }
      return next >= items.length ? 0 : next
    })
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        variant={triggerVariant}
        size={triggerSize}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            openAt(0)
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            openAt(items.length - 1)
          }
        }}
      >
        {trigger}
      </Button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1 min-w-[13rem] rounded border border-border bg-popover p-1 shadow-lg",
            "animate-in duration-100 fade-in-0 zoom-in-95 motion-reduce:animate-none",
            align === "end" ? "right-0" : "left-0"
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              close(true)
            } else if (event.key === "ArrowDown") {
              event.preventDefault()
              move(1)
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              move(-1)
            } else if (event.key === "Home") {
              event.preventDefault()
              setActiveIndex(0)
            } else if (event.key === "End") {
              event.preventDefault()
              setActiveIndex(items.length - 1)
            } else if (event.key === "Tab") {
              setOpen(false)
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-50",
                item.destructive && "text-destructive"
              )}
            >
              {item.icon ? (
                <span className="shrink-0 [&_svg]:size-3.5" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint ? (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {item.hint}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
