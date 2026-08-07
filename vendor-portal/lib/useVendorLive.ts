"use client"

import { useEffect, useRef } from "react"
import { vendorPulseApi } from "@/lib/api/client"

export const VENDOR_DATA_CHANGED = "oweg:vendor-data-changed"
export const VENDOR_ORDERS_CHANGED = "oweg:vendor-orders-changed"

export type VendorPulseSnapshot = Awaited<ReturnType<typeof vendorPulseApi.get>>

/** Notify shell + live pages that vendor data changed (after mutations). */
export function notifyVendorDataChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(VENDOR_DATA_CHANGED))
  window.dispatchEvent(new Event(VENDOR_ORDERS_CHANGED))
}

type Listener = {
  onInvalidate?: (pulse: VendorPulseSnapshot | null) => void
  onPulse?: (pulse: VendorPulseSnapshot) => void
}

const DEFAULT_INTERVAL_MS = 10_000

/** Shared pulse poller so Shell + pages don't each hit /vendor/pulse. */
let sharedRevision: string | null = null
let sharedTimer: number | null = null
let sharedListeners = new Set<Listener>()
let sharedBootstrapped = false

async function sharedTick(forceInvalidate = false) {
  if (typeof window === "undefined") return
  if (!localStorage.getItem("vendor_token")) return
  if (document.visibilityState === "hidden" && !forceInvalidate) return

  try {
    const pulse = await vendorPulseApi.get()
    const revision = String(pulse.revision || "")
    const changed =
      forceInvalidate ||
      (sharedRevision !== null && sharedRevision !== revision)
    sharedRevision = revision || sharedRevision

    for (const listener of sharedListeners) {
      listener.onPulse?.(pulse)
      if (changed || forceInvalidate) {
        listener.onInvalidate?.(pulse)
      }
    }
  } catch {
    // Keep last known state
  }
}

let sharedTickQueued = false
function queueSharedTick(forceInvalidate = false) {
  if (sharedTickQueued) return
  sharedTickQueued = true
  queueMicrotask(() => {
    sharedTickQueued = false
    void sharedTick(forceInvalidate)
  })
}

function ensureSharedPoller(intervalMs: number) {
  if (sharedBootstrapped) return
  sharedBootstrapped = true

  const schedule = () => {
    if (sharedTimer != null) window.clearInterval(sharedTimer)
    sharedTimer = window.setInterval(() => {
      void sharedTick(false)
    }, intervalMs)
  }

  void sharedTick(false)
  schedule()

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      queueSharedTick(true)
      schedule()
    } else if (sharedTimer != null) {
      window.clearInterval(sharedTimer)
      sharedTimer = null
    }
  }

  const onFocusOrLocal = () => {
    queueSharedTick(true)
  }

  document.addEventListener("visibilitychange", onVisible)
  window.addEventListener("focus", onFocusOrLocal)
  window.addEventListener(VENDOR_DATA_CHANGED, onFocusOrLocal)
  window.addEventListener(VENDOR_ORDERS_CHANGED, onFocusOrLocal)
}

type UseVendorLiveOptions = {
  /** Called when pulse revision changes, tab focuses, or local mutation events fire. */
  onInvalidate?: (pulse: VendorPulseSnapshot | null) => void
  /** Called on every successful pulse (for badges / balances). */
  onPulse?: (pulse: VendorPulseSnapshot) => void
  /** Poll interval while tab is visible. Default 10s. */
  intervalMs?: number
  enabled?: boolean
}

/**
 * Near-realtime vendor updates via /vendor/pulse.
 * Pauses while the tab is hidden; refetches on focus / visibility / local events.
 * Multiple consumers share one poller.
 */
export function useVendorLive(options: UseVendorLiveOptions = {}) {
  const { onInvalidate, onPulse, intervalMs = DEFAULT_INTERVAL_MS, enabled = true } = options
  const listenerRef = useRef<Listener>({ onInvalidate, onPulse })
  listenerRef.current.onInvalidate = onInvalidate
  listenerRef.current.onPulse = onPulse

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    if (!localStorage.getItem("vendor_token")) return

    const listener = listenerRef.current
    sharedListeners.add(listener)
    ensureSharedPoller(intervalMs)

    return () => {
      sharedListeners.delete(listener)
    }
  }, [enabled, intervalMs])
}
