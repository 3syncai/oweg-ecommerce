"use client"

import { useEffect, useState } from "react"
import { 
  ChevronDown, 
  ChevronRight,
  Buildings,
  Tag,
  ShoppingCart,
  Users,
} from "@medusajs/icons"

export default function VendorLayout() {
  const [currentPath, setCurrentPath] = useState("")
  const [productsExpanded, setProductsExpanded] = useState(false)

  useEffect(() => {
    console.log('[VendorLayout] Component mounted!')
    setCurrentPath(window.location.pathname)
    
    const handleNavigation = () => {
      setCurrentPath(window.location.pathname)
    }
    
    window.addEventListener("popstate", handleNavigation)
    const interval = setInterval(handleNavigation, 500)
    
    // Auto-expand Products if on products page
    if (window.location.pathname.includes("/vendor/products")) {
      setProductsExpanded(true)
    }
    
    return () => {
      window.removeEventListener("popstate", handleNavigation)
      clearInterval(interval)
    }
  }, [])

  const isActive = (path: string) => {
    return currentPath === path || currentPath.startsWith(path + "/")
  }

  const navigate = (path: string) => {
    window.location.href = path
  }

  const handleLogout = () => {
    localStorage.removeItem("vendor_token")
    window.location.href = "/app/login"
  }

  // Medusa admin UI colors
  const colors = {
    bg: "rgb(8, 8, 8)",
    border: "rgb(38, 38, 38)",
    textPrimary: "rgb(250, 250, 250)",
    textSecondary: "rgb(163, 163, 163)",
    hover: "rgb(28, 28, 28)",
    active: "rgb(38, 38, 38)",
  }

  console.log('[VendorLayout] Rendering sidebar')

  return (
    <aside
      id="vendor-sidebar"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "240px",
        height: "100vh",
        backgroundColor: colors.bg,
        borderRight: `1px solid ${colors.border}`,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Store Name */}
      <div
        style={{
          padding: "20px 16px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "6px",
            backgroundColor: colors.active,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            fontWeight: "600",
            color: colors.textPrimary,
            marginBottom: "8px",
          }}
        >
          V
        </div>
        <div style={{ fontSize: "13px", color: colors.textSecondary }}>
          Vendor Store
        </div>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 0",
        }}
      >
        {/* Dashboard */}
        <NavItem
          icon={<Buildings />}
          label="Dashboard"
          path="/app/vendor/dashboard"
          isActive={isActive("/app/vendor/dashboard")}
          onClick={() => navigate("/app/vendor/dashboard")}
          colors={colors}
        />

        {/* Products with submenu */}
        <div>
          <button
            onClick={() => setProductsExpanded(!productsExpanded)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              backgroundColor: isActive("/app/vendor/products") ? colors.active : "transparent",
              color: isActive("/app/vendor/products") ? colors.textPrimary : colors.textSecondary,
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (!isActive("/app/vendor/products")) {
                e.currentTarget.style.backgroundColor = colors.hover
              }
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (!isActive("/app/vendor/products")) {
                e.currentTarget.style.backgroundColor = "transparent"
              }
            }}
          >
            <Tag />
            <span style={{ flex: 1, textAlign: "left" }}>Products</span>
            {productsExpanded ? <ChevronDown /> : <ChevronRight />}
          </button>

          {/* Products Submenu */}
          {productsExpanded && (
            <div style={{ paddingLeft: "16px" }}>
              <SubNavItem
                icon={<Tag />}
                label="All Products"
                path="/app/vendor/products"
                isActive={currentPath === "/app/vendor/products"}
                onClick={() => navigate("/app/vendor/products")}
                colors={colors}
              />
              <SubNavItem
                icon={<Tag />}
                label="Collections"
                path="/app/vendor/products/collections"
                isActive={currentPath === "/app/vendor/products/collections"}
                onClick={() => navigate("/app/vendor/products/collections")}
                colors={colors}
              />
            </div>
          )}
        </div>

        {/* Orders */}
        <NavItem
          icon={<ShoppingCart />}
          label="Orders"
          path="/app/vendor/orders"
          isActive={isActive("/app/vendor/orders")}
          onClick={() => navigate("/app/vendor/orders")}
          colors={colors}
        />

        {/* Analytics */}
        <NavItem
          icon={<Buildings />}
          label="Analytics"
          path="/app/vendor/analytics"
          isActive={isActive("/app/vendor/analytics")}
          onClick={() => navigate("/app/vendor/analytics")}
          colors={colors}
        />

        {/* Profile */}
        <NavItem
          icon={<Users />}
          label="Profile"
          path="/app/vendor/profile"
          isActive={isActive("/app/vendor/profile")}
          onClick={() => navigate("/app/vendor/profile")}
          colors={colors}
        />
      </nav>

      {/* Settings & Logout */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: "12px 0",
        }}
      >
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 16px",
            backgroundColor: "transparent",
            color: colors.textSecondary,
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = colors.hover
            e.currentTarget.style.color = colors.textPrimary
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = colors.textSecondary
          }}
        >
          <Users />
          <span>Logout</span>
        </button>

        {/* User info */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${colors.border}`,
            marginTop: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: colors.active,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "600",
                color: colors.textPrimary,
              }}
            >
              V
            </div>
            <div style={{ fontSize: "12px", color: colors.textSecondary }}>
              Vendor
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// Nav Item Component
function NavItem({ icon, label, isActive, onClick, colors }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 16px",
        backgroundColor: isActive ? colors.active : "transparent",
        color: isActive ? colors.textPrimary : colors.textSecondary,
        border: "none",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = colors.hover
        }
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// Sub Nav Item Component
function SubNavItem({ icon, label, isActive, onClick, colors }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 16px",
        backgroundColor: isActive ? colors.active : "transparent",
        color: isActive ? colors.textPrimary : colors.textSecondary,
        border: "none",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "500",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = colors.hover
        }
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

