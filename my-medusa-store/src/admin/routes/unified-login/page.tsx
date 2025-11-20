"use client"

import { useState } from "react"
import { Container, Heading, Text, Input, Button } from "@medusajs/ui"

const UnifiedLoginPage = () => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginType, setLoginType] = useState<"admin" | "vendor">("admin")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const base = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
    const urlParams = new URLSearchParams(window.location.search)
    const redirectTo = urlParams.get("redirect")

    try {
      if (loginType === "vendor") {
        // Vendor login
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

        // Check approval
        const me = await fetch(`${base}/vendor/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (me.status === 403) {
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

        // Store vendor token and redirect to vendor dashboard
        localStorage.setItem("vendor_token", token)
        localStorage.removeItem("admin_token") // Clear any admin token
        window.location.href = redirectTo || "/app/vendor-dashboard"
      } else {
        // Admin login - use Medusa's default admin auth
        const res = await fetch(`${base}/auth/user/emailpass`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || "Admin login failed")
        }

        const data = await res.json()
        const token = data.token

        // Store admin token and redirect to admin dashboard
        localStorage.setItem("admin_token", token)
        localStorage.removeItem("vendor_token") // Clear any vendor token
        // Set admin session cookie for Medusa admin
        document.cookie = `medusa_admin_token=${token}; path=/; max-age=86400`
        window.location.href = redirectTo || "/app"
      }
    } catch (e: any) {
      setError(e?.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
      <Container className="p-8" style={{ maxWidth: "400px", width: "100%" }}>
        <div className="mb-6">
          <Heading level="h1" className="mb-2">Sign In</Heading>
          <Text className="text-ui-fg-subtle">Sign in to your account</Text>
        </div>

        <div className="mb-4 flex gap-2">
          <Button
            variant={loginType === "admin" ? "primary" : "secondary"}
            onClick={() => setLoginType("admin")}
            style={{ flex: 1 }}
          >
            Admin
          </Button>
          <Button
            variant={loginType === "vendor" ? "primary" : "secondary"}
            onClick={() => setLoginType("vendor")}
            style={{ flex: 1 }}
          >
            Vendor
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-ui-bg-error-subtle border border-ui-border-error rounded text-ui-fg-error text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {loginType === "vendor" && (
          <div className="mt-4 text-center">
            <Text className="text-ui-fg-subtle text-sm">
              Don't have an account?{" "}
              <a href="/public/vendors/form" className="text-ui-fg-interactive hover:underline">
                Become a vendor
              </a>
            </Text>
          </div>
        )}
      </Container>
    </div>
  )
}

export default UnifiedLoginPage

