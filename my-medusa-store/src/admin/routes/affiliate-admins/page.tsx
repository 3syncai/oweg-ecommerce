"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Input, Label, Table, Badge } from "@medusajs/ui"
import { Plus } from "@medusajs/icons"

type AffiliateAdmin = {
  id: string
  name: string
  email: string
  created_at: string
  last_login_at?: string | null
  login_ip?: string | null
}

const AffiliateAdminsPage = () => {
  const [loading, setLoading] = useState(true)
  const [affiliateAdmins, setAffiliateAdmins] = useState<AffiliateAdmin[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadAffiliateAdmins()
  }, [])

  const loadAffiliateAdmins = async () => {
    setLoading(true)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/affiliate/admins`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setAffiliateAdmins(data.affiliateAdmins || [])
      }
    } catch (error) {
      console.error("Failed to fetch affiliate admins:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/affiliate/admins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess("Affiliate admin created successfully!")
        setFormData({ name: "", email: "", password: "" })
        setShowCreateForm(false)
        loadAffiliateAdmins()
      } else {
        setError(data.message || "Failed to create affiliate admin")
      }
    } catch (error: any) {
      setError(error.message || "An error occurred")
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-"
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <Container style={{ padding: 24 }}>
        <Text>Loading affiliate admins...</Text>
      </Container>
    )
  }

  return (
    <Container style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Heading level="h1" style={{ marginBottom: 8 }}>
            Affiliate Admins
          </Heading>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            Manage affiliate administrators
          </Text>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
          Create Affiliate Admin
        </Button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "var(--bg-destructive-subtle)",
            border: "1px solid var(--border-destructive)",
            borderRadius: 6,
            color: "var(--fg-destructive)",
          }}
        >
          <Text size="small">{error}</Text>
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "var(--bg-success-subtle)",
            border: "1px solid var(--border-success)",
            borderRadius: 6,
            color: "var(--fg-success)",
          }}
        >
          <Text size="small">{success}</Text>
        </div>
      )}

      {showCreateForm && (
        <div
          style={{
            padding: 24,
            marginBottom: 24,
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-base)",
            borderRadius: 8,
          }}
        >
          <Heading level="h2" style={{ marginBottom: 16 }}>
            Create New Affiliate Admin
          </Heading>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{ marginTop: 8 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                style={{ marginTop: 8 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                style={{ marginTop: 8 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ name: "", email: "", password: "" })
                  setError(null)
                  setSuccess(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {affiliateAdmins.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Text style={{ color: "var(--fg-muted)" }}>No affiliate admins found</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Created At</Table.HeaderCell>
              <Table.HeaderCell>Last Login</Table.HeaderCell>
              <Table.HeaderCell>Login IP</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {affiliateAdmins.map((admin) => (
              <Table.Row key={admin.id}>
                <Table.Cell>
                  <Text weight="plus">{admin.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text>{admin.email}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{formatDate(admin.created_at)}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{formatDate(admin.last_login_at)}</Text>
                </Table.Cell>
                <Table.Cell>
                  {admin.login_ip ? (
                    <Badge>{admin.login_ip}</Badge>
                  ) : (
                    <Text size="small" style={{ color: "var(--fg-muted)" }}>
                      -
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Affiliate Admins",
})

export default AffiliateAdminsPage

