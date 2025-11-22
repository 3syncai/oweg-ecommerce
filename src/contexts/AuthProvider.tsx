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
      const next = await fetchSession()
      setCustomer(next)
    } catch (err) {
      console.warn("Failed to refresh session", err)
      setCustomer(null)
    } finally {
      setRefreshing(false)
      setInitializing(false)
    }
  }, [])

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
    setCustomer(value)
    setInitializing(false)
  }, [])

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
