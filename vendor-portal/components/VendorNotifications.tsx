"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Text, clx } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { vendorPayoutsApi } from "@/lib/api/client"

type VendorNotification = {
  id: string
  title: string
  body: string
  amount: number
  createdAt: string
  href: string
  kind: "credited" | "payout"
}

const SEEN_KEY = "oweg_vendor_notif_seen_v2"
const PRIMED_KEY = "oweg_vendor_notif_primed_v2"
const POLL_MS = 10000

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount)

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)))
  } catch {
    // ignore quota errors
  }
}

function isPrimed(): boolean {
  try {
    return localStorage.getItem(PRIMED_KEY) === "1"
  } catch {
    return false
  }
}

function markPrimed() {
  try {
    localStorage.setItem(PRIMED_KEY, "1")
  } catch {
    // ignore
  }
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export default function VendorNotifications() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<VendorNotification[]>([])
  const [toast, setToast] = useState<VendorNotification | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const knownUnseenRef = useRef<Set<string>>(new Set())
  const bootstrappedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef(false)

  const dismissIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    for (const id of ids) {
      seenRef.current.add(id)
      knownUnseenRef.current.delete(id)
    }
    writeSeenIds(seenRef.current)
    setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
  }, [])

  const dismissAllVisible = useCallback(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev
      for (const item of prev) {
        seenRef.current.add(item.id)
        knownUnseenRef.current.delete(item.id)
      }
      writeSeenIds(seenRef.current)
      return []
    })
  }, [])

  const loadNotifications = useCallback(async () => {
    if (typeof window === "undefined") return
    if (!localStorage.getItem("vendor_token")) return

    try {
      const [summaryRes, listRes] = await Promise.all([
        vendorPayoutsApi.summary().catch(() => null),
        vendorPayoutsApi.list().catch(() => null),
      ])

      const next: VendorNotification[] = []

      for (const row of summaryRes?.summary?.credited_recent || []) {
        const amount = Number(row.net_amount) || 0
        if (amount <= 0) continue
        next.push({
          id: `credited:${row.id}`,
          title: "Payment credited",
          body: `Order #${row.order_display_id || row.order_id.slice(0, 8)} credited to your payout balance`,
          amount,
          createdAt: row.credited_at || new Date().toISOString(),
          href: "/messages",
          kind: "credited",
        })
      }

      const payoutRows =
        listRes?.payouts ||
        (summaryRes as { payouts?: any[] } | null)?.payouts ||
        []

      for (const payout of payoutRows) {
        if (String(payout.status || "").toLowerCase() !== "processed") continue
        const amount = Number(payout.net_amount) || 0
        if (amount <= 0) continue
        next.push({
          id: `payout:${payout.id}`,
          title: "Payout received",
          body: payout.transaction_id
            ? `Admin paid out to your account · Txn ${payout.transaction_id}`
            : "Admin paid out to your account",
          amount,
          createdAt: payout.created_at || payout.updated_at || new Date().toISOString(),
          href: "/messages",
          kind: "payout",
        })
      }

      next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      const top = next.slice(0, 20)

      if (!bootstrappedRef.current) {
        seenRef.current = readSeenIds()
        // One-time only: hide old history so the first visit isn't flooded.
        // Never re-run this on refresh — that was swallowing admin payouts.
        if (!isPrimed()) {
          const cutoff = Date.now() - 60 * 60 * 1000
          for (const item of top) {
            if (new Date(item.createdAt).getTime() < cutoff) {
              seenRef.current.add(item.id)
            }
          }
          writeSeenIds(seenRef.current)
          markPrimed()
        }
        bootstrappedRef.current = true
      }

      if (openRef.current) return

      const unseen = top.filter((item) => !seenRef.current.has(item.id))
      setItems(unseen)

      const brandNew = unseen.filter((item) => !knownUnseenRef.current.has(item.id))
      knownUnseenRef.current = new Set(unseen.map((item) => item.id))

      if (brandNew.length > 0) {
        // Prefer payout notifications when admin just paid
        const payoutToast = brandNew.find((item) => item.kind === "payout")
        setToast(payoutToast || brandNew[0])
      }
    } catch (error) {
      console.warn("Failed to load vendor notifications", error)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()
    const id = window.setInterval(() => {
      void loadNotifications()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadNotifications])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 8000)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) {
        if (openRef.current) {
          dismissAllVisible()
          openRef.current = false
          setOpen(false)
        }
      }
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [dismissAllVisible])

  const openPanel = () => {
    setOpen((prev) => {
      if (prev) {
        dismissAllVisible()
        openRef.current = false
        return false
      }
      openRef.current = true
      return true
    })
  }

  const badgeLabel = useMemo(() => {
    if (items.length <= 0) return null
    return items.length > 9 ? "9+" : String(items.length)
  }, [items.length])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openPanel}
        className={clx(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-base text-ui-fg-subtle transition-colors",
          "hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
        )}
        aria-label="Notifications"
        title="Notifications"
      >
        <BellIcon />
        {badgeLabel ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-component shadow-xl">
          <div className="flex items-center justify-between border-b border-ui-border-base px-3 py-2.5">
            <Text weight="plus" size="small">
              Notifications
            </Text>
            <button
              type="button"
              className="text-xs text-ui-fg-muted hover:text-ui-fg-base"
              onClick={() => {
                dismissAllVisible()
                openRef.current = false
                setOpen(false)
                router.push("/messages")
              }}
            >
              View all
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Text size="small" className="text-ui-fg-subtle">
                  No new notifications
                </Text>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full flex-col gap-0.5 border-b border-ui-border-base/70 px-3 py-3 text-left last:border-b-0 hover:bg-ui-bg-base-hover"
                  onClick={() => {
                    dismissIds([item.id])
                    openRef.current = false
                    setOpen(false)
                    router.push(item.href)
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Text size="small" weight="plus">
                      {item.title}
                    </Text>
                    <Text size="small" className="shrink-0 text-emerald-600 font-medium">
                      +{formatCurrency(item.amount)}
                    </Text>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {item.body}
                  </Text>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(100vw-2rem,22rem)] rounded-xl border border-emerald-500/30 bg-ui-bg-component p-3 shadow-xl md:bottom-6 md:right-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Text size="small" weight="plus">
                {toast.title}
              </Text>
              <Text size="small" className="mt-0.5 text-ui-fg-subtle">
                {toast.body}
              </Text>
              <Text size="small" className="mt-1 font-medium text-emerald-600">
                +{formatCurrency(toast.amount)}
              </Text>
            </div>
            <button
              type="button"
              className="text-xs text-ui-fg-muted hover:text-ui-fg-base"
              onClick={() => setToast(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
