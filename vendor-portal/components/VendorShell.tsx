"use client"

import { PropsWithChildren, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { clx, Prompt } from "@medusajs/ui"
import Image from "next/image"
import Link from "next/link"
import styles from "./VendorShell.module.css"
import {
  ShoppingBag, Tag, LayoutDashboard, Boxes, ChevronDown,
  Ellipsis, WalletCards, RotateCcw, X, MessageSquare,
  ChartNoAxesCombined, FileText, UsersRound, Menu,
  Settings2, LogOut, ArrowUpRight,
} from "lucide-react"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { vendorProfileApi, vendorPayoutsApi } from "@/lib/api/client"
import { performVendorLogout } from "@/lib/vendor-session"
import { OWEG_BRAND } from "@/lib/brand"
import { useTheme } from "@/lib/theme"
import VendorSettingsModal from "@/components/VendorSettingsModal"
import VendorNotifications from "@/components/VendorNotifications"
import { useVendorLive } from "@/lib/useVendorLive"
import { warmReturnsCache } from "@/lib/warm-returns-cache"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string | null
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
    icon: LayoutDashboard,
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
        label: "Brand",
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
    icon: Boxes,
    type: "normal",
  },
  {
    label: "Orders",
    description: "",
    path: "/orders",
    icon: ShoppingBag,
    type: "normal",
  },
  {
    label: "Customers",
    description: "",
    path: "/customers",
    icon: UsersRound,
    type: "normal",
  },
  {
    label: "Returns",
    description: "",
    path: "/returns",
    icon: RotateCcw,
    type: "normal",
  },
  {
    label: "Payments",
    description: "",
    path: "/payout",
    icon: WalletCards,
    type: "normal",
  },
  {
    label: "Commission Invoice",
    description: "",
    path: "/commission-invoices",
    icon: FileText,
    type: "normal",
  },
  {
    label: "Claims",
    description: "",
    path: "/claims",
    icon: ChartNoAxesCombined,
    type: "normal",
  },
  {
    label: "Messages",
    description: "",
    path: "/messages",
    icon: MessageSquare,
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
  const [, setPayoutData] = useState<PayoutData>({ totalRevenue: 0, totalBalance: 0, loading: true })
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false)
  const [toAcceptCount, setToAcceptCount] = useState(0)

  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const sync = () => {
      setIsMobile(query.matches)
      if (!query.matches) setMobileMenuOpen(false)
    }
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const sidebar = sidebarRef.current
    const content = contentRef.current
    if (!sidebar || !content) return
    sidebar.inert = isMobile && !mobileMenuOpen
    content.inert = isMobile && mobileMenuOpen
    if (!isMobile || !mobileMenuOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }))
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setMobileMenuOpen(false)
        setAccountMenuOpen(false)
      }
      if (event.key !== "Tab") return
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),[tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!sidebar.contains(document.activeElement)) {
        event.preventDefault(); first?.focus(); return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => {
      content.inert = false
      cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", handleKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [isMobile, mobileMenuOpen])

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
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Failed to load vendor info: ${message}`)
      }
    }
    loadVendorInfo()
  }, [])

  // Prefetch Returns route + data so navbar clicks don't feel stuck
  useEffect(() => {
    router.prefetch("/returns")
    let cancelled = false
    const run = () => {
      if (!cancelled) warmReturnsCache()
    }
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 2500 })
    } else {
      timeoutId = setTimeout(run, 800)
    }
    return () => {
      cancelled = true
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [router])

  useEffect(() => {
    const paths = [
      "/dashboard",
      "/orders",
      "/products",
      "/payout",
      "/commission-invoices",
      "/claims",
      "/inventory",
      "/messages",
    ]
    for (const path of paths) router.prefetch(path)
  }, [router])

  useEffect(() => {
    const loadPayoutData = async () => {
      try {
        const data = await vendorPayoutsApi.summary().catch(() => null)
        const summary = data?.summary
        const balance =
          (summary?.available_balance || 0) + (summary?.unlocking_balance || 0)
        setPayoutData({ totalRevenue: balance, totalBalance: balance, loading: false })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Failed to load payout data: ${message}`)
        setPayoutData((prev) => ({ ...prev, loading: false }))
      }
    }
    loadPayoutData()
  }, [])

  useVendorLive({
    onPulse: (pulse) => {
      setToAcceptCount(typeof pulse?.to_accept === "number" ? pulse.to_accept : 0)
      const available = Number(pulse?.payout?.available_balance) || 0
      const unlocking = Number(pulse?.payout?.unlocking_balance) || 0
      const balance = available + unlocking
      setPayoutData({ totalRevenue: balance, totalBalance: balance, loading: false })
    },
  })

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

  const handleLogout = () => {
    void performVendorLogout("/login")
  }

  const groups = [
    { label: "Overview", paths: ["/dashboard"] },
    { label: "Catalogue", paths: ["/products", "/inventory"] },
    { label: "Operations", paths: ["/orders", "/customers", "/returns", "/messages"] },
    { label: "Finance", paths: ["/payout", "/commission-invoices", "/claims"] },
  ]
  const currentPage = pathname === "/profile" ? "Profile & store"
    : navItems.flatMap((item) => [...(item.children || []), item]).find((item) => pathname === item.path)?.label
      || navItems.find((item) => pathname?.startsWith(item.path))?.label || "Workspace"
  const closeNavigation = () => { setMobileMenuOpen(false); setAccountMenuOpen(false) }

  return (
    <div className={styles.shell}>
      {mobileMenuOpen && <button type="button" tabIndex={-1} className={styles.backdrop}
        aria-label="Close navigation backdrop" onClick={closeNavigation} />}

      <aside ref={sidebarRef} id="vendor-navigation" className={clx(styles.sidebar, mobileMenuOpen && styles.open)}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && mobileMenuOpen && isMobile
            && !sidebarRef.current?.contains(document.activeElement)) closeButtonRef.current?.focus({ preventScroll: true })
        }}
        role={isMobile ? "dialog" : undefined} aria-modal={isMobile && mobileMenuOpen ? true : undefined}
        aria-hidden={isMobile && !mobileMenuOpen ? true : undefined} aria-label="Vendor navigation">
        <div className={styles.brandHeader}>
          <Image src={platformLogo} alt="OWEG" width={90} height={30} className={styles.platformLogo} />
          <span className={styles.portalTag}>VENDOR</span>
          <button ref={closeButtonRef} type="button" className={styles.closeButton} aria-label="Close navigation" onClick={closeNavigation}><X size={19} /></button>
        </div>

        <Link href="/profile" onClick={closeNavigation} className={styles.storeCard} aria-label="View store profile">
          <div className={styles.storeAvatar}>
            {vendorInfo?.store_logo ? <Image src={vendorInfo.store_logo} alt="" width={40} height={40} unoptimized />
              : <span>{(vendorInfo?.store_name?.[0] || vendorInfo?.name?.[0] || "S").toUpperCase()}</span>}
          </div>
          <div className={styles.storeText}><strong>{vendorInfo?.store_name || "Your Store"}</strong><span>Manage your store</span></div>
          <ArrowUpRight size={15} className={styles.storeArrow} />
        </Link>

        <nav className={clx(styles.navigation, "oweg-scroll")} aria-label="Vendor workspace">
          {groups.map((group) => <section key={group.label} className={styles.navGroup} aria-label={group.label}>
            <h2 className={styles.groupTitle}>{group.label}</h2>
            {group.paths.map((path) => {
              const item = navItems.find((entry) => entry.path === path)!
              const active = activePath === item.path
              const expanded = expandedItems.includes(item.label)
              const exactActive = item.path === "/products"
                ? active && !item.children?.some((child) => pathname?.startsWith(child.path)) : active
              return <div key={item.path}>
                <div className={clx(styles.navRow, active && styles.active)}>
                  <Link href={item.path} className={styles.navLink} aria-current={exactActive ? "page" : undefined}
                    onClick={() => { if (item.path === "/returns") warmReturnsCache(); closeNavigation() }}
                    onMouseEnter={() => { router.prefetch(item.path); if (item.path === "/returns") warmReturnsCache() }}>
                    <item.icon size={18} strokeWidth={1.65} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.path === "/orders" && toAcceptCount > 0 && <span className={styles.orderCount} aria-label={`${toAcceptCount} orders to accept`}>{toAcceptCount > 99 ? "99+" : toAcceptCount}</span>}
                  </Link>
                  {item.children && <button type="button" className={styles.expandButton}
                    aria-label={expanded ? "Collapse product navigation" : "Expand product navigation"}
                    aria-expanded={expanded} aria-controls="vendor-product-navigation" onClick={() => toggleExpanded(item.label)}>
                    <ChevronDown size={15} className={expanded ? styles.chevronOpen : undefined} />
                  </button>}
                </div>
                {item.children && expanded && <div id="vendor-product-navigation" className={styles.subNav}>
                  {item.children.map((child) => <Link key={child.path} href={child.path}
                    className={clx(styles.subLink, pathname?.startsWith(child.path) && styles.subActive)}
                    aria-current={pathname?.startsWith(child.path) ? "page" : undefined} onClick={closeNavigation}>
                    <span className={styles.subDot} />{child.label}
                  </Link>)}
                </div>}
              </div>
            })}
          </section>)}
        </nav>

        <div className={styles.footer}>
          <div ref={accountMenuRef} className={styles.accountArea}>
            <button type="button" className={styles.accountButton} aria-expanded={accountMenuOpen}
              aria-controls="vendor-account-actions" aria-label="Account options"
              onKeyDown={(event) => { if (event.key === "Escape") setAccountMenuOpen(false) }}
              onClick={() => setAccountMenuOpen((prev) => !prev)}>
              <span className={styles.accountAvatar}>{vendorInfo?.email?.[0]?.toUpperCase() || "A"}</span>
              <span className={styles.accountText}><strong>{vendorInfo?.name || vendorInfo?.email?.split("@")[0] || "Your account"}</strong><small>Store owner</small></span>
              <Ellipsis size={18} />
            </button>
            {accountMenuOpen && <div id="vendor-account-actions" className={styles.accountMenu}>
              <button type="button" onClick={() => { closeNavigation(); setSettingsOpen(true) }}><Settings2 size={16} />Settings</button>
              <button type="button" className={styles.logout} onClick={() => { closeNavigation(); setLogoutPromptOpen(true) }}><LogOut size={16} />Log out</button>
            </div>}
          </div>
        </div>
      </aside>

      <div ref={contentRef} className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.pageContext}>
            <button ref={menuButtonRef} type="button" className={styles.menuButton} aria-label="Open navigation"
              aria-expanded={mobileMenuOpen} aria-controls="vendor-navigation" onClick={() => setMobileMenuOpen(true)}><Menu size={21} /></button>
            <div className={styles.breadcrumb}><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentPage}</strong></div>
          </div>
          <VendorNotifications />
        </header>
        <main className={clx(styles.main, "oweg-scroll bg-oweg-page")}>{children}</main>
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
