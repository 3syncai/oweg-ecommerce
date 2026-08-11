import { vendorReturnsApi } from "@/lib/api/client"
import { hasPageCache, pageCacheKey, writePageCache } from "@/lib/page-cache"

const PAGE_SIZE = 10

type ReturnCounts = {
  total: number
  pending_approval: number
  in_progress: number
  pickup: number
  refunded: number
  needs_logistics: number
}

type ReturnsCachePayload = {
  returns: unknown[]
  counts: ReturnCounts
  totalFiltered: number
}

/** Prefetch default returns list so navbar → Returns feels instant. */
export function warmReturnsCache() {
  if (typeof window === "undefined") return
  if (!localStorage.getItem("vendor_token")) return

  const key = pageCacheKey("returns", { status: "all", page: 1 })
  if (hasPageCache(key)) return

  void vendorReturnsApi
    .list({ limit: PAGE_SIZE, offset: 0 })
    .then((data) => {
      const nextReturns = data?.return_requests || []
      const nextCounts: ReturnCounts = data?.counts
        ? {
            total: Number(data.counts.total) || 0,
            pending_approval: Number(data.counts.pending_approval) || 0,
            in_progress: Number(data.counts.in_progress) || 0,
            pickup: Number((data.counts as any).pickup) || 0,
            refunded: Number((data.counts as any).refunded) || 0,
            needs_logistics: Number((data.counts as any).needs_logistics) || 0,
          }
        : {
            total: 0,
            pending_approval: 0,
            in_progress: 0,
            pickup: 0,
            refunded: 0,
            needs_logistics: 0,
          }

      writePageCache(key, {
        returns: nextReturns,
        counts: nextCounts,
        totalFiltered:
          typeof data?.count === "number" ? data.count : nextReturns.length,
      } satisfies ReturnsCachePayload)
    })
    .catch(() => {
      // ignore prefetch errors
    })
}
