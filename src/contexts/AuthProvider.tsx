"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queueWishlist, wishlistIds } from "@/lib/wishlist-client"
import { queueCartWrite } from "@/lib/cart-client"
import { clearUserSessionCache } from "@/lib/client-session-cache"

export type StoreCustomer = {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
} | null

type AuthContextValue = {
  customer: StoreCustomer
  initializing: boolean
  refreshing: boolean
  refresh: () => Promise<void>
  setCustomer: (customer: StoreCustomer) => void
  updateWishlist: (id: string, update: (ids: string[]) => string[]) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const SESSION_ENDPOINT = "/api/medusa/auth/session"
const LOGOUT_ENDPOINT = "/api/medusa/auth/logout"

async function fetchSession(): Promise<StoreCustomer> {
  const res = await fetch(SESSION_ENDPOINT, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  })
  if (!res.ok) return null
  const data = (await res.json()) as { customer?: StoreCustomer }
  return (data?.customer as StoreCustomer) ?? null
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [customer, setCustomer] = useState<StoreCustomer>(null)
  const [initializing, setInitializing] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const customerRef = useRef<StoreCustomer>(null)
  const wishlistRevision = useRef(0)

  // Every state writer also updates the ref synchronously so queued wishlist
  // intents cannot cross an account switch before React renders again.
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const prevCustomer = customerRef.current
      const revision = wishlistRevision.current
      let next = await fetchSession()
      const current = customerRef.current
      if (next && current?.id === next.id && revision !== wishlistRevision.current) {
        next = { ...next, metadata: { ...next.metadata, wishlist: current.metadata?.wishlist } }
      }
      customerRef.current = next
      setCustomer(next)
      
      // If user just logged in (was null, now has customer), merge guest cart
      if (!prevCustomer && next) {
        // Trigger merge asynchronously without blocking
        void queueCartWrite(async () => {
          try {
            const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null
            if (guestCartId) {
              const mergeRes = await fetch("/api/medusa/cart/merge", {
                method: "POST",
                signal: AbortSignal.timeout(20_000),
                headers: {
                  "content-type": "application/json",
                  "x-guest-cart-id": guestCartId,
                },
                credentials: "include",
              })
              
              if (mergeRes.ok) {
                const mergeData = await mergeRes.json()
                if (mergeData.merged && mergeData.cart) {
                  // Clear guest cart from localStorage
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("guest_cart_id")
                  }
                }
              }
            }
          } catch (mergeErr) {
            console.warn("Failed to merge guest cart", mergeErr)
            // Don't fail the login if merge fails
          }
        }).finally(() => { void queryClient.invalidateQueries({ queryKey: ["cart"] }) })
      }
    } catch (err) {
      console.warn("Failed to refresh session", err)
      customerRef.current = null
      setCustomer(null)
    } finally {
      setRefreshing(false)
      setInitializing(false)
    }
  }, [queryClient])

  useEffect(() => {
    void refresh()
    // Only run once on mount to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = useCallback(async () => {
    const previousCustomerId = customerRef.current?.id ?? null
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "include",
      })
    } catch (err) {
      console.warn("Failed to logout", err)
    } finally {
      clearUserSessionCache(queryClient, previousCustomerId)
      customerRef.current = null
      setCustomer(null)
    }
  }, [queryClient])

  const setCustomerState = useCallback((value: StoreCustomer) => {
    const prevCustomer = customerRef.current
    customerRef.current = value
    setCustomer(value)
    setInitializing(false)
    
    // If user just logged in (was null, now has customer), merge guest cart
    if (!prevCustomer && value) {
      // Trigger merge asynchronously without blocking
      void queueCartWrite(async () => {
        try {
          const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null
          if (guestCartId) {
            const mergeRes = await fetch("/api/medusa/cart/merge", {
              method: "POST",
              signal: AbortSignal.timeout(20_000),
              headers: {
                "content-type": "application/json",
                "x-guest-cart-id": guestCartId,
              },
              credentials: "include",
            })
            
            if (mergeRes.ok) {
              const mergeData = await mergeRes.json()
              if (mergeData.merged && mergeData.cart) {
                // Clear guest cart from localStorage
                if (typeof window !== "undefined") {
                  localStorage.removeItem("guest_cart_id")
                }
              }
            }
          }
        } catch (mergeErr) {
          console.warn("Failed to merge guest cart", mergeErr)
          // Don't fail the login if merge fails
        }
      }).finally(() => { void queryClient.invalidateQueries({ queryKey: ["cart"] }) })
    }
  }, [queryClient])

  const updateWishlist = useCallback((id: string, update: (ids: string[]) => string[]) => {
    const current = customerRef.current
    if (!current || current.id !== id) return
    const next = { ...current, metadata: { ...current.metadata, wishlist: update(wishlistIds(current.metadata?.wishlist)) } }
    wishlistRevision.current++
    customerRef.current = next
    setCustomer(next)
  }, [])

  useEffect(() => {
    if (!customer?.id) return
    const id = customer.id
    const reconcile = () => {
      void queueWishlist(async () => {
        if (customerRef.current?.id !== id) return
        const response = await fetch("/api/medusa/wishlist?ids=1", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10_000) })
        if (!response.ok) return
        const data = await response.json()
        if (data.customer?.id !== id || !Array.isArray(data.wishlist)) return
        updateWishlist(id, () => data.wishlist)
        void queryClient.invalidateQueries({ queryKey: ["wishlist", id] })
      }).catch(() => undefined)
    }
    const onStorage = (event: StorageEvent) => { if (event.key === "oweg_wishlist_updated") reconcile() }
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", reconcile)
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", reconcile) }
  }, [customer?.id, queryClient, updateWishlist])

  const value = useMemo<AuthContextValue>(
    () => ({
      customer,
      initializing,
      refreshing,
      refresh,
      setCustomer: setCustomerState,
      updateWishlist,
      logout,
    }),
    [customer, initializing, refreshing, refresh, setCustomerState, updateWishlist, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
