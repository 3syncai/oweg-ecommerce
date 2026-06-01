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
  height?: number | null
  width?: number | null
  length?: number | null
  weight?: number | null
  categories?: Array<{
    id: string
    name: string
    handle?: string
    parent_category_id?: string | null
  }>
  collection?: {
    id: string
    title: string
    handle?: string
  } | null
  vendor?: {
    id: string
    name: string
    store_name?: string | null
    email: string
  } | null
  metadata?: {
    vendor_id?: string
    approval_status?: string
    submitted_at?: string
    resubmitted_at?: string
    vendor_edit_remark?: string | null
    vendor_edit_history?: Array<{
      remark?: string
      submitted_at?: string
      vendor_id?: string
    }>
    last_vendor_changed_fields?: string[]
    mid_code?: string
    hs_code?: string
    country_of_origin?: string
    videos?: Array<{
      url: string
      key: string
      filename: string
    }>
    category_request?: string
    category_request_status?: string
    collection_request?: string
    collection_request_status?: string
    [key: string]: any
  }
}

const toTitleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const VendorProductsWidget = () => {
  const [products, setProducts] = useState<VendorProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<VendorProduct | null>(null)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [creatingCollection, setCreatingCollection] = useState(false)

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

  // Creates the requested category (and parent if needed), assigns it to the
  // product, and marks the request resolved.
  const handleCreateCategory = async (product: VendorProduct) => {
    const request = product.metadata?.category_request?.trim()
    if (!request || !product.id) return
    setCreatingCategory(true)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

      // Parse all formats produced by the bulk-upload flow:
      //   "Jackets (under Clothing)"  →  parent=Clothing, child=Jackets
      //   "Clothing > Jackets"        →  parent=Clothing, child=Jackets
      //   "Jackets"                   →  top-level category
      let parentName: string | null = null
      let categoryName: string

      const underMatch = request.match(/^(.+?)\s*\(under\s+(.+?)\)$/i)
      if (underMatch) {
        categoryName = underMatch[1].trim()
        parentName = underMatch[2].trim()
      } else {
        const parts = request.split(">").map((p: string) => p.trim()).filter(Boolean)
        parentName = parts.length > 1 ? parts[0] : null
        categoryName = parts[parts.length - 1]
      }

      const toHandle = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

      let parentId: string | null = null

      if (parentName) {
        // Try to find an existing category with that name
        const listRes = await fetch(
          `${backend}/admin/product-categories?q=${encodeURIComponent(parentName)}&limit=20`,
          { credentials: "include" }
        )
        if (listRes.ok) {
          const listData = await listRes.json()
          const match = (listData.product_categories || []).find(
            (c: any) => c.name.toLowerCase() === parentName.toLowerCase()
          )
          parentId = match?.id ?? null
        }

        // Create parent if not found
        if (!parentId) {
          const createParentRes = await fetch(`${backend}/admin/product-categories`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: parentName, handle: toHandle(parentName), is_active: true }),
          })
          if (!createParentRes.ok) throw new Error("Failed to create parent category")
          const createParentData = await createParentRes.json()
          parentId = createParentData.product_category?.id ?? null
        }
      }

      // Build a globally-unique handle. Medusa v2 enforces handle uniqueness
      // across the entire category tree, so prefix sub-categories with their
      // parent handle to avoid collisions (e.g. "home-appliances-test").
      const categoryHandle = parentId
        ? `${toHandle(parentName ?? categoryName)}-${toHandle(categoryName)}`
        : toHandle(categoryName)

      // Check if a category with this handle already exists — reuse it
      // instead of trying to create a duplicate (which returns 400).
      let newCatIdEarly: string | null = null
      const existingRes = await fetch(
        `${backend}/admin/product-categories?q=${encodeURIComponent(categoryName)}&limit=20`,
        { credentials: "include" }
      )
      if (existingRes.ok) {
        const existingData = await existingRes.json()
        const existing = (existingData.product_categories || []).find(
          (c: any) =>
            c.handle === categoryHandle ||
            (c.name.toLowerCase() === categoryName.toLowerCase() &&
              c.parent_category_id === parentId)
        )
        if (existing) newCatIdEarly = existing.id
      }

      // Create the category (or subcategory under parent)
      const createRes = newCatIdEarly
        ? null
        : await fetch(`${backend}/admin/product-categories`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: categoryName,
              handle: categoryHandle,
              is_active: true,
              ...(parentId ? { parent_category_id: parentId } : {}),
            }),
          })
      if (createRes && !createRes.ok) throw new Error("Failed to create category")
      const createData = createRes ? await createRes.json() : null
      const newCatId = newCatIdEarly ?? createData?.product_category?.id
      if (!newCatId) throw new Error("No category id returned")

      // Assign the new category to the product
      const existingCatIds = (product.categories || []).map((c) => ({ id: c.id }))
      const updateRes = await fetch(`${backend}/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: [...existingCatIds, { id: newCatId }],
          metadata: {
            ...product.metadata,
            category_request_status: "resolved",
            category_request_resolved_at: new Date().toISOString(),
          },
        }),
      })
      if (!updateRes.ok) throw new Error("Failed to assign category to product")

      // Refresh the list and re-select the updated product
      await fetchPendingProducts()
      setSelectedProduct((prev) =>
        prev?.id === product.id
          ? {
              ...prev,
              categories: [...(prev.categories || []), { id: newCatId, name: categoryName, parent_category_id: parentId }],
              metadata: { ...prev.metadata, category_request_status: "resolved" },
            }
          : prev
      )
    } catch (err) {
      console.error("Create category failed:", err)
      alert((err as Error).message || "Failed to create category")
    } finally {
      setCreatingCategory(false)
    }
  }

  // Creates the requested collection, assigns it to the product, marks resolved.
  const handleCreateCollection = async (product: VendorProduct) => {
    const request = product.metadata?.collection_request?.trim()
    if (!request || !product.id) return
    setCreatingCollection(true)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const toHandle = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

      // Create the collection
      const createRes = await fetch(`${backend}/admin/collections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: request, handle: toHandle(request) }),
      })
      if (!createRes.ok) throw new Error("Failed to create collection")
      const createData = await createRes.json()
      const newColId = createData.collection?.id
      if (!newColId) throw new Error("No collection id returned")

      // Assign the new collection to the product
      const updateRes = await fetch(`${backend}/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: newColId,
          metadata: {
            ...product.metadata,
            collection_request_status: "resolved",
            collection_request_resolved_at: new Date().toISOString(),
          },
        }),
      })
      if (!updateRes.ok) throw new Error("Failed to assign collection to product")

      await fetchPendingProducts()
      setSelectedProduct((prev) =>
        prev?.id === product.id
          ? {
              ...prev,
              collection: { id: newColId, title: request },
              metadata: { ...prev.metadata, collection_request_status: "resolved" },
            }
          : prev
      )
    } catch (err) {
      console.error("Create collection failed:", err)
      alert((err as Error).message || "Failed to create collection")
    } finally {
      setCreatingCollection(false)
    }
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

        {/* Videos Section */}
        {selectedProduct.metadata?.videos && Array.isArray(selectedProduct.metadata.videos) && selectedProduct.metadata.videos.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <Heading level="h3" style={{ marginBottom: 16 }}>
              Videos
            </Heading>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {selectedProduct.metadata.videos.map((video: any, index: number) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid var(--border-base)",
                    borderRadius: 8,
                    padding: 16,
                    background: "var(--bg-base)",
                  }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text weight="plus" size="small">
                      {video.filename || `Video ${index + 1}`}
                    </Text>
                  </div>
                  <video
                    controls
                    style={{
                      width: "100%",
                      maxWidth: 600,
                      borderRadius: 8,
                      background: "var(--bg-subtle)",
                    }}
                    src={video.url}
                  >
                    Your browser does not support the video tag.
                  </video>
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--fg-accent)",
                        textDecoration: "none",
                        fontSize: 12,
                      }}
                    >
                      Open video in new tab →
                    </a>
                  </div>
                </div>
              ))}
            </div>
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

        {/* Category row */}
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--bg-subtle)", borderRadius: 8, border: "1px solid var(--border-base)" }}>
          <Text weight="plus" size="small" style={{ marginBottom: 6, display: "block" }}>Category</Text>
          {(() => {
            const cats = selectedProduct.categories || []
            const catRequest = selectedProduct.metadata?.category_request
            const catRequestStatus = selectedProduct.metadata?.category_request_status

            if (cats.length > 0) {
              // Build path: find parent then child
              const cat = cats[0]
              const parentId = cat.parent_category_id
              const parent = parentId ? cats.find((c) => c.id === parentId) : null
              const path = parent
                ? `${toTitleCase(parent.name)} › ${toTitleCase(cat.name)}`
                : toTitleCase(cat.name)
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text size="small" style={{ color: "var(--fg-base)" }}>{path}</Text>
                  {catRequest && catRequestStatus === "pending" && (
                    <>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                        Also requested: &ldquo;{catRequest}&rdquo;
                      </span>
                      <button
                        onClick={() => handleCreateCategory(selectedProduct)}
                        disabled={creatingCategory}
                        style={{
                          fontSize: 11, padding: "3px 10px", borderRadius: 6,
                          background: creatingCategory ? "#e5e7eb" : "#1d4ed8",
                          color: creatingCategory ? "#6b7280" : "#fff",
                          border: "none", cursor: creatingCategory ? "not-allowed" : "pointer",
                          fontWeight: 500,
                        }}
                      >
                        {creatingCategory ? "Creating…" : "✚ Create & Assign"}
                      </button>
                    </>
                  )}
                </div>
              )
            }

            if (catRequest && catRequestStatus === "pending") {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                    Pending: &ldquo;{catRequest}&rdquo;
                  </span>
                  <button
                    onClick={() => handleCreateCategory(selectedProduct)}
                    disabled={creatingCategory}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6,
                      background: creatingCategory ? "#e5e7eb" : "#1d4ed8",
                      color: creatingCategory ? "#6b7280" : "#fff",
                      border: "none", cursor: creatingCategory ? "not-allowed" : "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {creatingCategory ? "Creating…" : "✚ Create & Assign"}
                  </button>
                </div>
              )
            }

            return <Text size="small" style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>No category assigned</Text>
          })()}
        </div>

        {/* Collection row */}
        <div style={{ marginBottom: 24, padding: "12px 16px", background: "var(--bg-subtle)", borderRadius: 8, border: "1px solid var(--border-base)" }}>
          <Text weight="plus" size="small" style={{ marginBottom: 6, display: "block" }}>Collection</Text>
          {(() => {
            const col = selectedProduct.collection
            const colRequest = selectedProduct.metadata?.collection_request
            const colRequestStatus = selectedProduct.metadata?.collection_request_status

            if (col) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text size="small">{toTitleCase(col.title)}</Text>
                  {colRequest && colRequestStatus === "pending" && (
                    <>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                        Also requested: &ldquo;{colRequest}&rdquo;
                      </span>
                      <button
                        onClick={() => handleCreateCollection(selectedProduct)}
                        disabled={creatingCollection}
                        style={{
                          fontSize: 11, padding: "3px 10px", borderRadius: 6,
                          background: creatingCollection ? "#e5e7eb" : "#1d4ed8",
                          color: creatingCollection ? "#6b7280" : "#fff",
                          border: "none", cursor: creatingCollection ? "not-allowed" : "pointer",
                          fontWeight: 500,
                        }}
                      >
                        {creatingCollection ? "Creating…" : "✚ Create & Assign"}
                      </button>
                    </>
                  )}
                </div>
              )
            }

            if (colRequest && colRequestStatus === "pending") {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                    Pending: &ldquo;{colRequest}&rdquo;
                  </span>
                  <button
                    onClick={() => handleCreateCollection(selectedProduct)}
                    disabled={creatingCollection}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6,
                      background: creatingCollection ? "#e5e7eb" : "#1d4ed8",
                      color: creatingCollection ? "#6b7280" : "#fff",
                      border: "none", cursor: creatingCollection ? "not-allowed" : "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {creatingCollection ? "Creating…" : "✚ Create & Assign"}
                  </button>
                </div>
              )
            }

            return <Text size="small" style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>No collection assigned</Text>
          })()}
        </div>

        {/* Attributes Section - Hidden from product request view */}
        {/* 
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Heading level="h3" style={{ marginBottom: 0 }}>
              Attributes
            </Heading>
            <button
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-muted)",
                padding: "4px 8px",
              }}
              title="Options"
            >
              ⋮
            </button>
          </div>
          
          <div style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: 8,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              background: "var(--border-base)",
            }}>
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Height</Text>
                <Text size="small">{selectedProduct.height ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Width</Text>
                <Text size="small">{selectedProduct.width ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Length</Text>
                <Text size="small">{selectedProduct.length ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Weight</Text>
                <Text size="small">{selectedProduct.weight ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>MID code</Text>
                <Text size="small">{selectedProduct.metadata?.mid_code ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>HS code</Text>
                <Text size="small">{selectedProduct.metadata?.hs_code ?? "-"}</Text>
              </div>
              
              <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                gridColumn: "1 / -1",
              }}>
                <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Country of origin</Text>
                <Text size="small">{selectedProduct.metadata?.country_of_origin ?? "-"}</Text>
              </div>
            </div>
          </div>
        </div>
        */}

        <div style={{ marginBottom: 24 }}>
          <Heading level="h3" style={{ marginBottom: 8 }}>
            Details
          </Heading>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
            <Text weight="plus">Status:</Text>
            <Text>{selectedProduct.status}</Text>

            <Text weight="plus">Submitted:</Text>
            <Text>{new Date(selectedProduct.metadata?.resubmitted_at || selectedProduct.metadata?.submitted_at || selectedProduct.created_at).toLocaleString()}</Text>

            <Text weight="plus">Vendor:</Text>
            <div>
              {selectedProduct.vendor ? (
                <>
                  <Text>{selectedProduct.vendor.store_name || selectedProduct.vendor.name}</Text>
                  {selectedProduct.vendor.store_name && (
                    <Text size="small" style={{ color: "var(--fg-muted)" }}>
                      {selectedProduct.vendor.name}
                    </Text>
                  )}
                  <Text size="small" style={{ color: "var(--fg-muted)" }}>
                    {selectedProduct.vendor.email}
                  </Text>
                </>
              ) : (
                <Text style={{ color: "var(--fg-muted)" }}>
                  {selectedProduct.metadata?.vendor_id || "Unknown Vendor"}
                </Text>
              )}
            </div>

            <Text weight="plus">Sales Channel:</Text>
            <Text>{(selectedProduct as any).sales_channels?.map((sc: any) => sc.name).join(", ") || "Default Sales Channel"}</Text>

            <Text weight="plus">Vendor Remark:</Text>
            <div>
              {selectedProduct.metadata?.vendor_edit_remark ? (
                <Text style={{ whiteSpace: "pre-wrap" }}>{selectedProduct.metadata.vendor_edit_remark}</Text>
              ) : (
                <Text style={{ color: "var(--fg-muted)" }}>No remark provided</Text>
              )}
            </div>

            <Text weight="plus">Changed Fields:</Text>
            <div>
              {Array.isArray(selectedProduct.metadata?.last_vendor_changed_fields) &&
              selectedProduct.metadata?.last_vendor_changed_fields.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedProduct.metadata.last_vendor_changed_fields.map((field: string) => (
                    <Badge key={field} color="blue" size="small">
                      {field}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Text style={{ color: "var(--fg-muted)" }}>Not specified</Text>
              )}
            </div>
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
                <Table.HeaderCell>Vendor</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Submitted</Table.HeaderCell>
                <Table.HeaderCell>Remark</Table.HeaderCell>
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
                    {product.vendor ? (
                      <div>
                        <Text weight="plus" size="small">
                          {product.vendor.store_name || product.vendor.name}
                        </Text>
                        {product.vendor.store_name && (
                          <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
                            {product.vendor.name}
                          </Text>
                        )}
                        <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
                          {product.vendor.email}
                        </Text>
                      </div>
                    ) : (
                      <Text size="small" style={{ color: "var(--fg-muted)" }}>
                        Unknown Vendor
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="orange">Pending</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {new Date(product.metadata?.resubmitted_at || product.metadata?.submitted_at || product.created_at).toLocaleDateString()}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small" style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {product.metadata?.vendor_edit_remark || "-"}
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

