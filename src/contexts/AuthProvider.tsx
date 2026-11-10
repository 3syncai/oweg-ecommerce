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
import { clearCustomerSessionQueries, clearUserSessionCache } from "@/lib/client-session-cache"
import { disableBrowserPush, resumeBrowserPushSession } from "@/lib/browser-push"

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
  refresh: (options?: { afterSignIn?: boolean }) => Promise<void>
  signIn: { customerId: string } | null
  expiredCustomerId: string | null
  expireSession: (customerId: string) => void
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
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401) return null
  if (!res.ok) throw new Error("Session verification unavailable")
  const data = (await res.json()) as { customer?: StoreCustomer }
  if (data?.customer === null) return null
  if (typeof data?.customer?.id !== "string" || !data.customer.id) {
    throw new Error("Invalid session response")
  }
  return data.customer
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [customer, setCustomer] = useState<StoreCustomer>(null)
  const [signIn, setSignIn] = useState<AuthContextValue["signIn"]>(null)
  const [expiredCustomerId, setExpiredCustomerId] = useState<string | null>(null)
  useEffect(() => { if (customer?.id) resumeBrowserPushSession() }, [customer?.id])
  const [initializing, setInitializing] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const customerRef = useRef<StoreCustomer>(null)
  const wishlistRevision = useRef(0)
  const authRevision = useRef(0)

  const expireSession = useCallback((customerId: string) => {
    if (customerRef.current?.id !== customerId) return
    authRevision.current++
    customerRef.current = null
    setExpiredCustomerId(customerId)
    setCustomer(null)
    setSignIn(null)
    clearCustomerSessionQueries(queryClient, customerId)
  }, [queryClient])

  // Every state writer also updates the ref synchronously so queued wishlist
  // intents cannot cross an account switch before React renders again.
  const refresh = useCallback(async (options?: { afterSignIn?: boolean }) => {
    const authAtStart = authRevision.current
    setRefreshing(true)
    try {
      const prevCustomer = customerRef.current
      const revision = wishlistRevision.current
      let next = await fetchSession()
      if (authAtStart !== authRevision.current) {
        if (options?.afterSignIn) throw new Error("Sign-in changed. Please try again.")
        return
      }
      const current = customerRef.current
      if (options?.afterSignIn && !next) throw new Error("Couldn’t verify sign-in. Please try again.")
      if (!next && current) {
        expireSession(current.id)
        return
      }
      if (next && current?.id === next.id && revision !== wishlistRevision.current) {
        next = { ...next, metadata: { ...next.metadata, wishlist: current.metadata?.wishlist } }
      }
      if (next?.id !== current?.id) {
        authRevision.current++
        if (current) clearCustomerSessionQueries(queryClient, current.id)
      }
      customerRef.current = next
      setCustomer(next)
      if (next) setExpiredCustomerId(null)
      if (options?.afterSignIn && next) setSignIn({ customerId: next.id })
      if (!next) setSignIn(null)
      
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
    } catch (error) {
      // A network error or upstream outage is not evidence of session expiry.
      if (options?.afterSignIn) throw error
    } finally {
      setRefreshing(false)
      setInitializing(false)
    }
  }, [expireSession, queryClient])

  useEffect(() => {
    void refresh()
    // Only run once on mount to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = useCallback(async () => {
    const previousCustomerId = customerRef.current?.id ?? null
    authRevision.current++
    try {
      await disableBrowserPush().catch(() => undefined)
      if ((customerRef.current?.id ?? null) !== previousCustomerId) throw new Error("Account changed")
      const response = await fetch(LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error("Unable to confirm sign-out")
      if ((customerRef.current?.id ?? null) !== previousCustomerId) throw new Error("Account changed")
      authRevision.current++
      clearUserSessionCache(queryClient, previousCustomerId)
      customerRef.current = null
      setCustomer(null)
      setSignIn(null)
      setExpiredCustomerId(null)
    } catch (error) {
      if (customerRef.current?.id === previousCustomerId) resumeBrowserPushSession()
      throw error
    }
  }, [queryClient])

  const setCustomerState = useCallback((value: StoreCustomer) => {
    authRevision.current++
    const prevCustomer = customerRef.current
    if (prevCustomer && prevCustomer.id !== value?.id) clearCustomerSessionQueries(queryClient, prevCustomer.id)
    customerRef.current = value
    setCustomer(value)
    setSignIn(value ? { customerId: value.id } : null)
    setExpiredCustomerId(null)
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
      signIn,
      expiredCustomerId,
      expireSession,
      initializing,
      refreshing,
      refresh,
      setCustomer: setCustomerState,
      updateWishlist,
      logout,
    }),
    [customer, signIn, expiredCustomerId, expireSession, initializing, refreshing, refresh, setCustomerState, updateWishlist, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
