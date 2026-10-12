"use client"

import { useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * TanStack Query wraps the mock gateway so the data-fetching boundary behaves
 * like a real one: loading, error and retry are handled by the same machinery
 * that would handle HTTP, rather than being faked with local state.
 *
 * The client is created in state so each browser session gets exactly one and
 * it is never shared across server requests.
 */
export function QueryProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The world is generated once and then owned by the simulation
            // engine, so refetching would fight the engine for authority.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            staleTime: Number.POSITIVE_INFINITY,
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
