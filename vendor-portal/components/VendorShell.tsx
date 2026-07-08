"use client"

import { PropsWithChildren, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Text, clx, Prompt } from "@medusajs/ui"
import Image from "next/image"
import {
  MagnifyingGlass,
  ShoppingCart,
  Tag,
  Buildings,
  Users,
  ChevronDown,
  ChevronRight,
  EllipsisHorizontal,
  CurrencyDollar,
  XMark,
} from "@medusajs/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { vendorProfileApi, vendorPayoutsApi } from "@/lib/api/client"
import { performVendorLogout } from "@/lib/vendor-session"
import { OWEG_BRAND } from "@/lib/brand"
import { useTheme } from "@/lib/theme"
import VendorSettingsModal from "@/components/VendorSettingsModal"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
  store_logo?: string | null
}

type PayoutData = {
  totalRevenue: number
  totalBalance: number
  loading: boolean
}

const navItems = [
  {
    label: "Dashboard",
    description: "",
    path: "/dashboard",
    icon: Buildings,
    type: "normal",
  },
  {
    label: "Search",
    description: "⌘K",
    path: "/search",
    icon: MagnifyingGlass,
    type: "normal",
  },
  {
    label: "Orders",
    description: "",
    path: "/orders",
    icon: ShoppingCart,
    type: "normal",
  },
  {
    label: "Products",
    description: "",
    path: "/products",
    icon: Tag,
    type: "parent",
    children: [
      {
        label: "Collections",
        path: "/products/collections",
      },
      {
        label: "Categories",
        path: "/products/categories",
      },
    ],
  },
  {
    label: "Inventory",
    description: "",
    path: "/inventory",
    icon: Buildings,
    type: "normal",
  },
  {
    label: "Customers",
    description: "",
    path: "/customers",
    icon: Users,
    type: "normal",
  },
  {
    label: "Payout",
    description: "",
    path: "/payout",
    icon: CurrencyDollar,
    type: "normal",
  },
]

const VendorShellInner = ({ children }: PropsWithChildren) => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const platformLogo = isDark ? OWEG_BRAND.logoPathDark : OWEG_BRAND.logoPathLight
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null)
  const [payoutData, setPayoutData] = useState<PayoutData>({ totalRevenue: 0, totalBalance: 0, loading: true })
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>(["Products"])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false)

  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (searchParams.get("settings") === "1") {
      setSettingsOpen(true)
      const next = new URLSearchParams(searchParams.toString())
      next.delete("settings")
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname || "/dashboard")
    }
  }, [searchParams, pathname, router])

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    )
  }

  useEffect(() => {
    if (pathname?.includes("/products")) {
      setExpandedItems((prev) => {
        if (!prev.includes("Products")) {
          return [...prev, "Products"]
        }
        return prev
      })
    }
    // Close mobile menu on route change
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const loadVendorInfo = async () => {
      try {
        const data = await vendorProfileApi.getMe()
        setVendorInfo(data?.vendor || null)
      } catch (error) {
        console.error("Failed to load vendor info:", error)
      }
    }
    loadVendorInfo()
  }, [])

  useEffect(() => {
    const loadPayoutData = async () => {
      try {
        const data = await vendorPayoutsApi.summary().catch(() => null)
        const summary = data?.summary
        const balance =
          (summary?.available_balance || 0) + (summary?.unlocking_balance || 0)
        setPayoutData({ totalRevenue: balance, totalBalance: balance, loading: false })
      } catch (error) {
        console.error("Failed to load payout data:", error)
        setPayoutData((prev) => ({ ...prev, loading: false }))
      }
    }
    loadPayoutData()
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!accountMenuRef.current) return
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  const activePath = useMemo(() => {
    if (!pathname) return ""
    if (pathname.includes("/products/collections") || pathname.includes("/products/categories")) {
      return "/products"
    }
    const activeItem = navItems.find((item) => pathname.startsWith(item.path))
    return activeItem?.path || ""
  }, [pathname])

  const navigate = (path: string) => {
    if (path === pathname) return
    router.push(path)
  }

  const handleLogout = () => {
    void performVendorLogout("/login")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ui-bg-base text-ui-fg-base font-sans">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-oweg-500/15 bg-oweg-sidebar transition-transform duration-300 md:static md:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header — vendor store (vendor logo slot) */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-oweg-500/10 px-4">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {vendorInfo?.store_logo ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-oweg-500/20 shadow-sm">
                <Image
                  src={vendorInfo.store_logo}
                  alt={vendorInfo.store_name || "Store logo"}
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oweg-500/15 text-sm font-semibold text-oweg-800 ring-1 ring-oweg-500/25 dark:text-oweg-200">
                {(vendorInfo?.store_name?.[0] || vendorInfo?.name?.[0] || "S").toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ui-fg-base">
                {vendorInfo?.store_name || "Your Store"}
              </span>
              <span className="block truncate text-xs text-oweg-600 dark:text-oweg-400">
                Vendor Portal
              </span>
            </div>
          </button>
          <button
            type="button"
            className="shrink-0 md:hidden text-ui-fg-subtle"
            onClick={() => setMobileMenuOpen(false)}
          >
            <XMark />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = activePath === item.path
              const hasChildren = item.type === "parent" && item.children
              const isExpanded = expandedItems.includes(item.label)

              return (
                <div key={item.path}>
                  <button
                    onClick={() => {
                      if (hasChildren) {
                        toggleExpanded(item.label)
                        navigate(item.path)
                      } else {
                        navigate(item.path)
                      }
                    }}
                    className={clx(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all duration-200",
                      active
                        ? "oweg-nav-active"
                        : "text-ui-fg-subtle hover:bg-oweg-500/[0.06] hover:text-ui-fg-base"
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center text-ui-fg-muted">
                      <item.icon />
                    </span>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-ui-fg-muted">{item.description}</span>
                    )}
                    {hasChildren && (
                      <span className="flex h-4 w-4 items-center justify-center text-ui-fg-muted">
                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                      </span>
                    )}
                  </button>

                  {hasChildren && isExpanded && item.children && (
                    <div className="mt-1 flex flex-col gap-1 pl-11">
                      {item.children.map((child) => {
                        const isChildActive = pathname?.includes(child.path)
                        return (
                          <button
                            key={child.path}
                            onClick={() => navigate(child.path)}
                            className={clx(
                              "w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200",
                              isChildActive
                                ? "oweg-nav-active font-medium"
                                : "text-ui-fg-subtle hover:bg-oweg-500/[0.06] hover:text-ui-fg-base"
                            )}
                          >
                            {child.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>

        {/* User Menu */}
        <div className="border-t border-oweg-500/10 p-4">
          {/* OWEG platform branding — not in vendor logo slot */}
          <div
            className={clx(
              "mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2 ring-1",
              isDark
                ? "bg-zinc-950 ring-oweg-500/20"
                : "bg-oweg-50 ring-oweg-200/80"
            )}
          >
            <Image
              src={platformLogo}
              alt="OWEG"
              width={72}
              height={24}
              className="h-5 w-auto object-contain"
            />
            <span
              className={clx(
                "text-[10px] font-medium uppercase tracking-wider",
                isDark ? "text-ui-fg-muted" : "text-oweg-700"
              )}
            >
              Platform
            </span>
          </div>

          <div ref={accountMenuRef} className="relative">
            <button
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all hover:bg-oweg-500/[0.06]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-oweg-500/15 text-sm font-semibold text-oweg-800 ring-1 ring-oweg-500/25 dark:text-oweg-200">
                {vendorInfo?.email?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex-1 overflow-hidden">
                <Text size="small" weight="plus" className="truncate text-ui-fg-base">
                  {vendorInfo?.email?.split("@")[0] || "admin"}
                </Text>
              </div>
              <span className="text-ui-fg-muted">
                <EllipsisHorizontal />
              </span>
            </button>

            {accountMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 flex flex-col gap-0.5 rounded-lg border border-ui-border-base bg-ui-bg-component p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false)
                    setSettingsOpen(true)
                  }}
                  className="rounded-md px-3 py-2.5 text-left text-sm text-ui-fg-base hover:bg-ui-bg-base-hover transition-colors"
                >
                  Settings
                </button>
                <div className="my-0.5 h-px bg-ui-border-base" />
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false)
                    setLogoutPromptOpen(true)
                  }}
                  className="rounded-md px-3 py-2.5 text-left text-sm text-ui-fg-subtle hover:bg-ui-bg-base-hover transition-colors"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="flex h-16 items-center gap-3 border-b border-oweg-500/10 bg-ui-bg-component px-4 shadow-sm md:hidden">
          <button
            type="button"
            className="shrink-0 text-ui-fg-base"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.75 6.75H20.25M3.75 12H20.25M3.75 17.25H20.25" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ui-fg-base">
              {vendorInfo?.store_name || "Your Store"}
            </div>
            <div className="truncate text-xs text-ui-fg-muted">Vendor Portal</div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-ui-bg-base bg-oweg-page">
          {children}
        </main>
      </div>

      <VendorSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Logout confirmation prompt */}
      <Prompt
        variant="confirmation"
        open={logoutPromptOpen}
        onOpenChange={setLogoutPromptOpen}
      >
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Log out of vendor portal?</Prompt.Title>
            <Prompt.Description>
              You&apos;ll need to sign in again to access your dashboard, products, and
              orders.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={handleLogout}>Yes, log out</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

const VendorShell = ({ children }: PropsWithChildren) => (
  <Suspense fallback={<div className="flex h-screen items-center justify-center bg-ui-bg-base">Loading…</div>}>
    <VendorShellInner>{children}</VendorShellInner>
  </Suspense>
)

export default VendorShell

