"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

/*
 * The theme hotkey that ships with this scaffold lived here. It is gone on
 * purpose: all keyboard handling is owned by `useKeyboardShortcuts`, which
 * binds T to the theme and D to the delivery board. Two independent window
 * listeners competing for the same keys is exactly the kind of drift that
 * single ownership prevents.
 */

export { ThemeProvider }
