"use client"

import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react"
import { Text } from "@medusajs/ui"
import {
  MagnifyingGlass,
  ShoppingCart,
  Tag,
  Buildings,
  Users,
  ChevronDown,
  ChevronRight,
  EllipsisHorizontal,
} from "@medusajs/icons"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
}

const sidebarWidth = 256

const navItems = [
  {
    label: "Dashboard",
    description: "",
    path: "/app/vendor/dashboard",
    icon: Buildings,
    type: "normal",
  },
  {
    label: "Search",
    description: "⌘K",
    path: "/app/vendor/search",
    icon: MagnifyingGlass,
    type: "normal",
  },
  {
    label: "Orders",
    description: "",
    path: "/app/vendor/orders",
    icon: ShoppingCart,
    type: "normal",
  },
  {
    label: "Products",
    description: "",
    path: "/app/vendor/products",
    icon: Tag,
    type: "parent",
    children: [
      {
        label: "Collections",
        path: "/app/vendor/products/collections",
      },
      {
        label: "Categories",
        path: "/app/vendor/products/categories",
      },
    ],
  },
  {
    label: "Inventory",
    description: "",
    path: "/app/vendor/inventory",
    icon: Buildings,
    type: "normal",
  },
  {
    label: "Customers",
    description: "",
    path: "/app/vendor/customers",
    icon: Users,
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
  const [currentPath, setCurrentPath] = useState("")
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>(["Products"])
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    )
  }

  useEffect(() => {
    setCurrentPath(window.location.pathname)

    const handleNavigation = () => {
      const path = window.location.pathname
      setCurrentPath(path)
      
      // Auto-expand Products dropdown if we're on any products route
      if (path.includes("/app/vendor/products")) {
        setExpandedItems((prev) => {
          if (!prev.includes("Products")) {
            return [...prev, "Products"]
          }
          return prev
        })
      }
    }

    handleNavigation() // Call immediately on mount

    window.addEventListener("popstate", handleNavigation)
    const interval = window.setInterval(handleNavigation, 500)

    return () => {
      window.removeEventListener("popstate", handleNavigation)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const loadVendorInfo = async () => {
      try {
        const token = localStorage.getItem("vendor_token")
        if (!token) return

        const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
        const res = await fetch(`${backend}/vendor/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          setVendorInfo(data?.vendor || null)
        }
      } catch (error) {
        console.error("Failed to load vendor info:", error)
      }
    }

    loadVendorInfo()
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
    if (!currentPath) return ""
    
    // Check if we're on a child route (collections or categories)
    if (currentPath.includes("/app/vendor/products/collections") || 
        currentPath.includes("/app/vendor/products/categories")) {
      return "/app/vendor/products"
    }
    
    const activeItem = navItems.find((item) => currentPath.startsWith(item.path))
    return activeItem?.path || ""
  }, [currentPath])

  const navigate = (path: string) => {
    if (path === currentPath) return
    window.location.href = path
  }

  const handleLogout = () => {
    localStorage.removeItem("vendor_token")
    window.location.href = "/app/login"
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
              }}
            >
              M
            </div>
            <div>
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
                        const isChildActive = currentPath.includes(child.path)
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
              onClick={() => navigate("/app/settings")}
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
                  navigate("/app/vendor/profile")
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
              <button
                onClick={() => {
                  setAccountMenuOpen(false)
                  navigate("/app/vendor/analytics")
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
                Insights
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

