"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge } from "@medusajs/ui"
import { CheckCircleSolid, XCircleSolid, ClockSolid } from "@medusajs/icons"

type VendorDocument = {
  key: string
  url: string
  name?: string
  type?: string
}

type VendorProduct = {
  id: string
  title: string
  status: string
  approval_status?: string | null
  created_at: string
  thumbnail?: string | null
}

type Vendor = {
  id: string
  name: string
  email: string
  store_name?: string | null
  phone?: string | null
  is_approved: boolean
  approved_at?: string | null
  approved_by?: string | null
  rejected_at?: string | null
  rejected_by?: string | null
  rejection_reason?: string | null
  created_at: string
  status: "approved" | "rejected" | "pending"
  product_count: number
  products: VendorProduct[]
}

const VendorsPage = () => {
  const [loading, setLoading] = useState(true)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [approvedVendors, setApprovedVendors] = useState<Vendor[]>([])
  const [rejectedVendors, setRejectedVendors] = useState<Vendor[]>([])
  const [pendingVendors, setPendingVendors] = useState<Vendor[]>([])
  const [selectedTab, setSelectedTab] = useState<"all" | "approved" | "rejected" | "pending">("all")
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadVendors()
  }, [])

  const loadVendors = async () => {
    setLoading(true)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/vendors/all`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setVendors(data.vendors || [])
        setApprovedVendors(data.approved || [])
        setRejectedVendors(data.rejected || [])
        setPendingVendors(data.pending || [])
      }
    } catch (error) {
      console.error("Failed to fetch vendors:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleVendorProducts = (vendorId: string) => {
    const newExpanded = new Set(expandedVendors)
    if (newExpanded.has(vendorId)) {
      newExpanded.delete(vendorId)
    } else {
      newExpanded.add(vendorId)
    }
    setExpandedVendors(newExpanded)
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

  const getStatusBadge = (vendor: Vendor) => {
    if (vendor.status === "approved") {
      return (
        <Badge color="green" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircleSolid style={{ width: 12, height: 12 }} />
          Approved
        </Badge>
      )
    } else if (vendor.status === "rejected") {
      return (
        <Badge color="red" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <XCircleSolid style={{ width: 12, height: 12 }} />
          Rejected
        </Badge>
      )
    } else {
      return (
        <Badge color="orange" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ClockSolid style={{ width: 12, height: 12 }} />
          Pending
        </Badge>
      )
    }
  }

  const getVendorsToDisplay = () => {
    switch (selectedTab) {
      case "approved":
        return approvedVendors
      case "rejected":
        return rejectedVendors
      case "pending":
        return pendingVendors
      default:
        return vendors
    }
  }

  const renderVendorRow = (vendor: Vendor) => {
    const isExpanded = expandedVendors.has(vendor.id)
    
    return (
      <div key={vendor.id} style={{ marginBottom: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 16,
            background: "var(--bg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <Text weight="plus">{vendor.store_name || vendor.name}</Text>
              {getStatusBadge(vendor)}
            </div>
            <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 4 }}>
              {vendor.email}
            </Text>
            <Text size="small" style={{ color: "var(--fg-muted)" }}>
              {vendor.phone || "No phone"}
            </Text>
          </div>
          
          <div style={{ minWidth: 200, textAlign: "right" }}>
            <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 4 }}>
              Products: <strong>{vendor.product_count}</strong>
            </Text>
            {vendor.status === "approved" && vendor.approved_at && (
              <div>
                <Text size="x-small" style={{ color: "var(--fg-muted)" }}>
                  Approved Date:
                </Text>
                <Text size="small" style={{ color: "var(--fg-base)", fontWeight: 500 }}>
                  {formatDate(vendor.approved_at)}
                </Text>
                {vendor.approved_by && (
                  <Text size="x-small" style={{ color: "var(--fg-muted)", marginTop: 2 }}>
                    By: {vendor.approved_by}
                  </Text>
                )}
              </div>
            )}
            {vendor.status === "rejected" && vendor.rejected_at && (
              <div>
                <Text size="x-small" style={{ color: "var(--fg-muted)" }}>
                  Rejected Date:
                </Text>
                <Text size="small" style={{ color: "var(--fg-destructive)", fontWeight: 500 }}>
                  {formatDate(vendor.rejected_at)}
                </Text>
                {vendor.rejected_by && (
                  <Text size="x-small" style={{ color: "var(--fg-muted)", marginTop: 2 }}>
                    By: {vendor.rejected_by}
                  </Text>
                )}
              </div>
            )}
            {vendor.status === "pending" && (
              <div>
                <Text size="x-small" style={{ color: "var(--fg-muted)" }}>
                  Created Date:
                </Text>
                <Text size="small" style={{ color: "var(--fg-base)", fontWeight: 500 }}>
                  {formatDate(vendor.created_at)}
                </Text>
              </div>
            )}
          </div>
          
          <Button
            variant="secondary"
            onClick={() => toggleVendorProducts(vendor.id)}
          >
            {isExpanded ? "Hide" : "Show"} Products
          </Button>
        </div>
        
        {isExpanded && (
          <div
            style={{
              marginTop: 8,
              marginLeft: 32,
              padding: 16,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-base)",
              borderRadius: 8,
            }}
          >
            {vendor.status === "rejected" && (
              <div style={{ marginBottom: 16 }}>
                <Badge color="red" style={{ marginBottom: 8 }}>
                  Rejected - Vendor can reapply
                </Badge>
                {vendor.rejection_reason && (
                  <div style={{ padding: 12, background: "var(--bg-base)", borderRadius: 6 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4, color: "var(--fg-destructive)" }}>
                      Rejection Reason:
                    </Text>
                    <Text size="small">{vendor.rejection_reason}</Text>
                    {vendor.rejected_at && (
                      <Text size="x-small" style={{ marginTop: 8, color: "var(--fg-muted)" }}>
                        Rejected on: {formatDate(vendor.rejected_at)}
                      </Text>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {vendor.products.length > 0 ? (
              <div>
                <Text weight="plus" style={{ marginBottom: 12 }}>
                  Products ({vendor.products.length})
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {vendor.products.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        background: "var(--bg-base)",
                        borderRadius: 6,
                      }}
                    >
                      {product.thumbnail && (
                        <img
                          src={product.thumbnail}
                          alt={product.title}
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <Text size="small" weight="plus">{product.title}</Text>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <Text size="x-small" style={{ color: "var(--fg-muted)" }}>
                            Status: {product.status}
                          </Text>
                          {product.approval_status && (
                            <Badge color={product.approval_status === "approved" ? "green" : product.approval_status === "rejected" ? "red" : "orange"}>
                              {product.approval_status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => window.open(`/app/products/${product.id}`, "_blank")}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Text size="small" style={{ color: "var(--fg-muted)" }}>
                No products listed yet
              </Text>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <Container style={{ padding: 24 }}>
        <Text>Loading vendors...</Text>
      </Container>
    )
  }

  const vendorsToDisplay = getVendorsToDisplay()

  return (
    <Container style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Heading level="h1" style={{ marginBottom: 8 }}>
          Vendors
        </Heading>
        <Text size="small" style={{ color: "var(--fg-muted)" }}>
          Manage all vendors, view their status, and see their products
        </Text>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: "flex", 
        gap: 8, 
        marginBottom: 24,
        borderBottom: "1px solid var(--border-base)",
        paddingBottom: 8,
      }}>
        <Button
          variant={selectedTab === "all" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("all")}
        >
          All ({vendors.length})
        </Button>
        <Button
          variant={selectedTab === "approved" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("approved")}
        >
          Approved ({approvedVendors.length})
        </Button>
        <Button
          variant={selectedTab === "rejected" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("rejected")}
        >
          Rejected ({rejectedVendors.length})
        </Button>
        <Button
          variant={selectedTab === "pending" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("pending")}
        >
          Pending ({pendingVendors.length})
        </Button>
      </div>

        {vendorsToDisplay.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Text style={{ color: "var(--fg-muted)" }}>
              No {selectedTab !== "all" ? selectedTab : ""} vendors found
            </Text>
          </div>
        ) : (
          <div>
            {vendorsToDisplay.map((vendor) => renderVendorRow(vendor))}
          </div>
        )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendors",
})

export default VendorsPage
