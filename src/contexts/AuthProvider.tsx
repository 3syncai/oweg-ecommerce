"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

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
  const [customer, setCustomer] = useState<StoreCustomer>(null)
  const [initializing, setInitializing] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const prevCustomer = customer
      const next = await fetchSession()
      setCustomer(next)
      
      // If user just logged in (was null, now has customer), merge guest cart
      if (!prevCustomer && next) {
        try {
          const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null
          if (guestCartId) {
            const mergeRes = await fetch("/api/medusa/cart/merge", {
              method: "POST",
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
      }
    } catch (err) {
      console.warn("Failed to refresh session", err)
      setCustomer(null)
    } finally {
      setRefreshing(false)
      setInitializing(false)
    }
  }, [customer])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "include",
      })
    } catch (err) {
      console.warn("Failed to logout", err)
    } finally {
      setCustomer(null)
    }
  }, [])

  const setCustomerState = useCallback((value: StoreCustomer) => {
    const prevCustomer = customer
    setCustomer(value)
    setInitializing(false)
    
    // If user just logged in (was null, now has customer), merge guest cart
    if (!prevCustomer && value) {
      // Trigger merge asynchronously without blocking
      void (async () => {
        try {
          const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null
          if (guestCartId) {
            const mergeRes = await fetch("/api/medusa/cart/merge", {
              method: "POST",
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
      })()
    }
  }, [customer])

  const value = useMemo<AuthContextValue>(
    () => ({
      customer,
      initializing,
      refreshing,
      refresh,
      setCustomer: setCustomerState,
      logout,
    }),
    [customer, initializing, refreshing, refresh, setCustomerState, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
