"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "vendor-portal-theme"

type ThemeContextValue = {
  /** What the user picked (may be "system"). */
  theme: ThemeMode
  /** What is actually applied to <html> right now. */
  resolvedTheme: ResolvedTheme
  setTheme: (next: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system"
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === "light" || raw === "dark" || raw === "system") return raw
  } catch {
    /* ignore */
  }
  return "system"
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  root.dataset.theme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark")

  // Hydrate from storage / system on mount.
  useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    const next: ResolvedTheme = stored === "system" ? getSystemTheme() : stored
    setResolvedTheme(next)
    applyTheme(next)
  }, [])

  // Track OS theme changes when in "system" mode.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const next: ResolvedTheme = mql.matches ? "dark" : "light"
      setResolvedTheme(next)
      applyTheme(next)
    }
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [theme])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    const resolved: ResolvedTheme = next === "system" ? getSystemTheme() : next
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Safe fallback so consumers outside the provider still render.
    return {
      theme: "system",
      resolvedTheme: "dark",
      setTheme: () => undefined,
    }
  }
  return ctx
}

/**
 * Inline script string to run BEFORE React hydrates so the theme is applied
 * pre-paint and we avoid a flash of the wrong theme. Inject into <head>.
 */
export const themeBootstrapScript = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='light'||s==='dark')?s:(prefersDark?'dark':'light');var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;r.dataset.theme=t;}catch(e){}})();`
