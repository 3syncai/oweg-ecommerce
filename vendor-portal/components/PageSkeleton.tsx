"use client"

import { Container, Text } from "@medusajs/ui"

type PageSkeletonProps = {
  /** Optional label shown beneath the skeleton (e.g. "Loading orders…") */
  label?: string
  /** Number of stat cards to show in the top grid (set to 0 to hide) */
  stats?: number
  /** Number of table rows to render */
  rows?: number
  /** Number of table columns to render */
  cols?: number
  /** Show the right-side primary action button placeholder */
  showAction?: boolean
}

/**
 * Generic skeleton placeholder used across listing pages
 * (Orders, Products, Customers, Inventory, Payout).
 *
 * Mirrors the typical layout: title + subtitle + action,
 * an optional stats grid, then a table card with rows.
 */
const PageSkeleton = ({
  label = "Loading…",
  stats = 0,
  rows = 6,
  cols = 4,
  showAction = true,
}: PageSkeletonProps) => {
  return (
    <Container className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-md bg-ui-bg-base-hover animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
        </div>
        {showAction && (
          <div className="h-9 w-32 rounded-md bg-ui-bg-base-hover animate-pulse" />
        )}
      </div>

      {/* Stats grid */}
      {stats > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div
              key={i}
              className="p-4 border border-ui-border-base rounded-lg bg-ui-bg-base space-y-3"
            >
              <div className="h-3 w-24 rounded-md bg-ui-bg-base-hover animate-pulse" />
              <div className="h-6 w-20 rounded-md bg-ui-bg-base-hover animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 w-64 rounded-md bg-ui-bg-base-hover animate-pulse" />
        <div className="h-9 w-24 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
        <div className="h-9 w-24 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="border border-ui-border-base rounded-lg overflow-hidden">
        <div className="flex items-center gap-4 border-b border-ui-border-base bg-ui-bg-subtle/40 px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="h-3 flex-1 rounded-md bg-ui-bg-base-hover animate-pulse"
            />
          ))}
        </div>
        <div>
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="grid grid-cols-12 gap-4 px-4 py-4 border-b border-ui-border-base last:border-b-0 items-center"
            >
              <div className="col-span-1">
                <div className="h-9 w-9 rounded-md bg-ui-bg-base-hover animate-pulse" />
              </div>
              <div className="col-span-4 space-y-2">
                <div className="h-3 w-3/4 rounded-md bg-ui-bg-base-hover animate-pulse" />
                <div className="h-3 w-1/2 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
              </div>
              <div className="col-span-3">
                <div className="h-3 w-2/3 rounded-md bg-ui-bg-base-hover animate-pulse" />
              </div>
              <div className="col-span-2">
                <div className="h-3 w-1/2 rounded-md bg-ui-bg-base-hover animate-pulse" />
              </div>
              <div className="col-span-2 flex justify-end">
                <div className="h-3 w-16 rounded-md bg-ui-bg-base-hover animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="flex items-center justify-center gap-2 pt-2 text-ui-fg-subtle">
        <span className="h-2 w-2 rounded-full bg-ui-fg-muted animate-pulse" />
        <Text size="small">{label}</Text>
      </div>
    </Container>
  )
}

export default PageSkeleton
