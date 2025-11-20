"use client"

import { useState } from "react"
import { Button, Input, Text } from "@medusajs/ui"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

const VendorLoginOption = () => {
  const [showVendorLogin, setShowVendorLogin] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVendorLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const base = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    try {
      const res = await fetch(`${base}/vendor/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Vendor login failed")
      }

      const data = await res.json()
      const token = data.token

      // Check approval status
      const me = await fetch(`${base}/vendor/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (me.status === 403) {
        // Vendor not approved
        localStorage.setItem("vendor_token", token)
        window.location.href = "/vendor/pending"
        return
      }

      // Check if password reset needed
      if (data?.vendor_user?.must_reset_password) {
        localStorage.setItem("vendor_token", token)
        window.location.href = "/vendor/reset-password"
        return
      }

      // Vendor is approved - redirect to vendor dashboard
      localStorage.setItem("vendor_token", token)
      localStorage.removeItem("admin_token")
      
      // Redirect to vendor dashboard
      window.location.href = "/app/vendor/dashboard"
    } catch (e: any) {
      setError(e?.message || "Vendor login failed")
    } finally {
      setLoading(false)
    }
  }

  if (!showVendorLogin) {
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-base)" }}>
        <Text className="text-ui-fg-subtle" style={{ fontSize: "14px", marginBottom: 8 }}>
          Are you a vendor?
        </Text>
        <Button
          variant="secondary"
          onClick={() => setShowVendorLogin(true)}
          style={{ width: "100%" }}
        >
          Login as Vendor
        </Button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-base)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ fontSize: "14px", fontWeight: 500 }}>Vendor Login</Text>
        <Button
          variant="transparent"
          onClick={() => {
            setShowVendorLogin(false)
            setError(null)
            setEmail("")
            setPassword("")
          }}
          style={{ padding: "4px 8px", fontSize: "12px" }}
        >
          Back to Admin
        </Button>
      </div>

      {error && (
        <div style={{ 
          padding: "8px 12px", 
          background: "var(--bg-error-subtle)", 
          border: "1px solid var(--border-error)", 
          borderRadius: "6px",
          marginBottom: 12,
          color: "var(--fg-error)",
          fontSize: "13px"
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleVendorLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            fontWeight: 500, 
            marginBottom: 4,
            color: "var(--fg-subtle)"
          }}>
            Email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            placeholder="vendor@example.com"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            fontWeight: 500, 
            marginBottom: 4,
            color: "var(--fg-subtle)"
          }}>
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
            style={{ width: "100%" }}
          />
        </div>

        <Button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Signing in..." : "Sign in as Vendor"}
        </Button>
      </form>

      <Text style={{ fontSize: "12px", color: "var(--fg-subtle)", marginTop: 8, textAlign: "center" }}>
        Don't have an account?{" "}
        <a href="/public/vendors/form" style={{ color: "var(--fg-interactive)", textDecoration: "none" }}>
          Become a vendor
        </a>
      </Text>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "login.after",
})

export default VendorLoginOption

