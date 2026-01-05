"use client"

import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react"
import { Text } from "@medusajs/ui"
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
  ChartBar,
  CurrencyDollar,
} from "@medusajs/icons"
import { usePathname, useRouter } from "next/navigation"
import { vendorProfileApi, vendorOrdersApi } from "@/lib/api/client"

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

const sidebarWidth = 256

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
const shellColors = {
  sidebarBg: "var(--bg-component, #0b1221)",
  sidebarBorder: "var(--border-base, #1f2937)",
  sidebarActive: "var(--fg-interactive, #2563eb)",
  sidebarText: "var(--fg-base, #e5e7eb)",
  sidebarMuted: "var(--fg-subtle, #94a3b8)",
  mainBg: "var(--bg-base, #111827)",
  headerBg: "var(--bg-subtle, #0f172a)",
}

const VendorShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname()
  const router = useRouter()
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null)
  const [payoutData, setPayoutData] = useState<PayoutData>({ totalRevenue: 0, totalBalance: 0, loading: true })
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>(["Products"])
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    )
  }

  useEffect(() => {
    // Auto-expand Products dropdown if we're on any products route
    if (pathname?.includes("/products")) {
      setExpandedItems((prev) => {
        if (!prev.includes("Products")) {
          return [...prev, "Products"]
        }
        return prev
      })
    }
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
        const ordersData = await vendorOrdersApi.list().catch(() => ({ orders: [] }))
        const orders = ordersData?.orders || []

        const totalRevenue = orders.reduce((sum: number, order: any) => {
          return sum + (order.total || 0)
        }, 0)

        // For now, total balance equals total revenue
        // In the future, you can subtract withdrawn amounts
        const totalBalance = totalRevenue

        setPayoutData({ totalRevenue, totalBalance, loading: false })
      } catch (error) {
        console.error("Failed to load payout data:", error)
        setPayoutData({ totalRevenue: 0, totalBalance: 0, loading: false })
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

    // Check if we're on a child route (collections or categories)
    if (pathname.includes("/products/collections") ||
      pathname.includes("/products/categories")) {
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
    localStorage.removeItem("vendor_token")
    localStorage.removeItem("vendor_user")
    // Clear cookie as well
    document.cookie = 'vendor_token=; path=/; max-age=0; SameSite=Lax'
    router.push("/login")
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        backgroundColor: shellColors.mainBg,
        color: "white",
        zIndex: 100000,
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <aside
        style={{
          width: sidebarWidth,
          background: shellColors.sidebarBg,
          borderRight: `1px solid ${shellColors.sidebarBorder}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "24px 24px 20px",
            borderBottom: `1px solid ${shellColors.sidebarBorder}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {vendorInfo?.store_logo ? (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Image
                  src={vendorInfo.store_logo}
                  alt={vendorInfo.store_name || "Store logo"}
                  width={44}
                  height={44}
                  style={{
                    objectFit: "cover",
                    width: "100%",
                    height: "100%",
                  }}
                  unoptimized
                />
              </div>
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 600,
                  color: shellColors.sidebarText,
                  flexShrink: 0,
                }}
              >
                {(vendorInfo?.store_name?.[0] || vendorInfo?.name?.[0] || "M").toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text weight="plus" style={{ color: shellColors.sidebarText, fontSize: 16 }}>
                {vendorInfo?.store_name ? `${vendorInfo.store_name} Store` : "Medusa Store"}
              </Text>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 12px",
                      background: active ? "rgba(255, 255, 255, 0.1)" : "transparent",
                      cursor: "pointer",
                      color: shellColors.sidebarText,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent"
                      }
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: shellColors.sidebarMuted,
                      }}
                    >
                      <item.icon />
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{item.label}</span>
                    {item.description && (
                      <span style={{ fontSize: 12, color: shellColors.sidebarMuted }}>{item.description}</span>
                    )}
                    {hasChildren && (
                      <span style={{ width: 16, height: 16, color: shellColors.sidebarMuted }}>
                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                      </span>
                    )}
                  </button>
                  {hasChildren && isExpanded && item.children && (
                    <div style={{ paddingLeft: 44, marginTop: 4, marginBottom: 4 }}>
                      {item.children.map((child) => {
                        const isChildActive = pathname?.includes(child.path)
                        return (
                          <button
                            key={child.path}
                            onClick={() => navigate(child.path)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 12px",
                              background: isChildActive ? "rgba(255, 255, 255, 0.1)" : "transparent",
                              cursor: "pointer",
                              color: isChildActive ? shellColors.sidebarText : shellColors.sidebarMuted,
                              fontSize: 14,
                              fontWeight: isChildActive ? 500 : 400,
                              transition: "background 0.1s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!isChildActive) {
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isChildActive) {
                                e.currentTarget.style.background = "transparent"
                              }
                            }}
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
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${shellColors.sidebarBorder}` }}>
          <div style={{ padding: "12px 20px 12px" }}>
            <button
              onClick={() => navigate("/settings")}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                borderRadius: 8,
                padding: "10px 12px",
                background: "transparent",
                cursor: "pointer",
                color: shellColors.sidebarText,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 14,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
              }}
            >
              <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: shellColors.sidebarMuted }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8.5 2H11.5L12 4.5C12.5 4.7 13 5 13.5 5.5L16 4.5L17.5 7L15.5 8.5C15.6 9 15.6 9.5 15.5 10L17.5 11.5L16 14L13.5 13C13 13.5 12.5 13.8 12 14L11.5 16.5H8.5L8 14C7.5 13.8 7 13.5 6.5 13L4 14L2.5 11.5L4.5 10C4.4 9.5 4.4 9 4.5 8.5L2.5 7L4 4.5L6.5 5.5C7 5 7.5 4.7 8 4.5L8.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <span style={{ fontWeight: 500 }}>Settings</span>
            </button>
          </div>

          <div
            ref={accountMenuRef}
            style={{
              padding: "12px 12px",
              borderTop: `1px solid ${shellColors.sidebarBorder}`,
              position: "relative",
            }}
          >
            <button
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: shellColors.sidebarText,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {vendorInfo?.email?.[0]?.toUpperCase() || "A"}
              </div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <Text size="small" weight="plus" style={{ color: shellColors.sidebarText }}>
                  {vendorInfo?.email?.split("@")[0] || "admin"}
                </Text>
              </div>
              <span style={{ color: shellColors.sidebarMuted, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <EllipsisHorizontal />
              </span>
            </button>
            {accountMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  bottom: 78,
                  background: shellColors.headerBg,
                  border: `1px solid ${shellColors.sidebarBorder}`,
                  borderRadius: 12,
                  padding: 8,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  zIndex: 10,
                }}
              >
                <button
                  onClick={() => {
                    setAccountMenuOpen(false)
                    navigate("/profile")
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 8,
                    color: shellColors.sidebarText,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  Profile settings
                </button>
                <div style={{ height: 1, background: shellColors.sidebarBorder, margin: "4px 0" }} />
                <button
                  onClick={handleLogout}
                  style={{
                    border: "none",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "transparent",
                    color: shellColors.sidebarMuted,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: shellColors.mainBg,
        }}
      >
        <main
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export default VendorShell

