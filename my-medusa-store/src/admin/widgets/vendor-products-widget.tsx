"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge, Button, Table } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { CheckCircleSolid, XCircleSolid } from "@medusajs/icons"

type VendorProduct = {
  id: string
  title: string
  subtitle?: string
  description?: string
  status: string
  thumbnail?: string
  created_at: string
  metadata?: {
    vendor_id?: string
    approval_status?: string
    submitted_at?: string
  }
}

const VendorProductsWidget = () => {
  const [products, setProducts] = useState<VendorProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<VendorProduct | null>(null)

  useEffect(() => {
    fetchPendingProducts()
  }, [])

  const fetchPendingProducts = async () => {
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/custom/vendor-products/pending`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error("Failed to fetch pending products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (productId: string) => {
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/custom/vendor-products/${productId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        fetchPendingProducts()
        setSelectedProduct(null)
      }
    } catch (error) {
      console.error("Failed to approve product:", error)
    }
  }

  const handleReject = async (productId: string) => {
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/custom/vendor-products/${productId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        fetchPendingProducts()
        setSelectedProduct(null)
      }
    } catch (error) {
      console.error("Failed to reject product:", error)
    }
  }

  const handleEdit = (productId: string) => {
    window.location.href = `/app/products/${productId}`
  }

  if (loading) {
    return (
      <Container>
        <Text>Loading pending products...</Text>
      </Container>
    )
  }

  if (selectedProduct) {
    return (
      <Container className="p-6">
        <div style={{ marginBottom: 24 }}>
          <Button variant="secondary" onClick={() => setSelectedProduct(null)}>
            ← Back to list
          </Button>
        </div>

        <Heading level="h2" style={{ marginBottom: 16 }}>
          {selectedProduct.title}
        </Heading>

        {selectedProduct.subtitle && (
          <Text size="large" style={{ marginBottom: 16, color: "var(--fg-muted)" }}>
            {selectedProduct.subtitle}
          </Text>
        )}

        <div style={{ marginBottom: 24 }}>
          <Badge color="orange">Pending Approval</Badge>
        </div>

        {selectedProduct.thumbnail && (
          <div style={{ marginBottom: 24 }}>
            <img
              src={selectedProduct.thumbnail}
              alt={selectedProduct.title}
              style={{ maxWidth: 400, borderRadius: 8 }}
            />
          </div>
        )}

        {selectedProduct.description && (
          <div style={{ marginBottom: 24 }}>
            <Heading level="h3" style={{ marginBottom: 8 }}>
              Description
            </Heading>
            <Text>{selectedProduct.description}</Text>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <Heading level="h3" style={{ marginBottom: 8 }}>
            Details
          </Heading>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
            <Text weight="plus">Status:</Text>
            <Text>{selectedProduct.status}</Text>

            <Text weight="plus">Submitted:</Text>
            <Text>{new Date(selectedProduct.metadata?.submitted_at || selectedProduct.created_at).toLocaleString()}</Text>

            <Text weight="plus">Vendor ID:</Text>
            <Text>{selectedProduct.metadata?.vendor_id}</Text>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={() => handleEdit(selectedProduct.id)}>
            Edit Product
          </Button>
          <Button onClick={() => handleApprove(selectedProduct.id)}>
            <CheckCircleSolid />
            Approve
          </Button>
          <Button variant="danger" onClick={() => handleReject(selectedProduct.id)}>
            <XCircleSolid />
            Reject
          </Button>
        </div>
      </Container>
    )
  }

  return (
    <Container className="p-6">
      <div style={{ marginBottom: 24 }}>
        <Heading level="h2">Vendor Products Pending Approval</Heading>
        <Text style={{ color: "var(--fg-muted)" }}>
          Review and approve products submitted by vendors
        </Text>
      </div>

      {products.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Text style={{ color: "var(--fg-muted)" }}>No pending products</Text>
        </div>
      ) : (
        <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: 8 }}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Submitted</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {products.map((product) => (
                <Table.Row key={product.id}>
                  <Table.Cell>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {product.thumbnail && (
                        <img
                          src={product.thumbnail}
                          alt={product.title}
                          style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover" }}
                        />
                      )}
                      <div>
                        <Text weight="plus">{product.title}</Text>
                        {product.subtitle && (
                          <Text size="small" style={{ color: "var(--fg-muted)" }}>
                            {product.subtitle}
                          </Text>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="orange">Pending</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {new Date(product.metadata?.submitted_at || product.created_at).toLocaleDateString()}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="small" variant="secondary" onClick={() => setSelectedProduct(product)}>
                        View
                      </Button>
                      <Button size="small" variant="secondary" onClick={() => handleEdit(product.id)}>
                        Edit
                      </Button>
                      <Button size="small" onClick={() => handleApprove(product.id)}>
                        Approve
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default VendorProductsWidget

