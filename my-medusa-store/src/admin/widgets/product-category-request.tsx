import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Badge, Button, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Surfaces vendor-submitted "create new category/collection" requests on
 * the product detail page. The requests come from the bulk-upload flow in
 * the vendor portal where the vendor couldn't find a matching entry in
 * the dropdown — they leave a free-text remark which we persist on the
 * product as `metadata.category_request` / `metadata.collection_request`.
 *
 * The widget lets the admin:
 *   - see each request alongside the original Excel value (for context),
 *   - one-click "Create & Assign" to create the category/collection and
 *     assign it to the product automatically,
 *   - manually mark each request as resolved if they prefer to handle it
 *     themselves in the respective admin section.
 */

type Kind = "category" | "collection"

type ProductMetadata = {
  category_request?: string
  category_request_excel_value?: string | null
  category_request_status?: "pending" | "resolved" | string
  category_request_submitted_at?: string
  category_request_resolved_at?: string
  category_request_resolved_by?: string

  collection_request?: string
  collection_request_excel_value?: string | null
  collection_request_status?: "pending" | "resolved" | string
  collection_request_submitted_at?: string
  collection_request_resolved_at?: string
  collection_request_resolved_by?: string

  [key: string]: unknown
}

type Product = {
  id: string
  title?: string
  categories?: Array<{ id: string; name?: string; parent_category_id?: string | null }>
  collection?: { id: string; title?: string } | null
  metadata?: ProductMetadata | null
}

const KIND_CONFIG: Record<
  Kind,
  {
    label: string
    sectionUrl: string
    hint: string
    metaKeys: {
      remark: keyof ProductMetadata
      excel: keyof ProductMetadata
      status: keyof ProductMetadata
      submittedAt: keyof ProductMetadata
      resolvedAt: keyof ProductMetadata
    }
  }
> = {
  category: {
    label: "category",
    sectionUrl: "/app/categories",
    hint: "Settings → Categories",
    metaKeys: {
      remark: "category_request",
      excel: "category_request_excel_value",
      status: "category_request_status",
      submittedAt: "category_request_submitted_at",
      resolvedAt: "category_request_resolved_at",
    },
  },
  collection: {
    label: "collection",
    sectionUrl: "/app/collections",
    hint: "Settings → Collections",
    metaKeys: {
      remark: "collection_request",
      excel: "collection_request_excel_value",
      status: "collection_request_status",
      submittedAt: "collection_request_submitted_at",
      resolvedAt: "collection_request_resolved_at",
    },
  },
}

const toHandle = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const formatTimestamp = (iso?: string): string => {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

const ProductCategoryRequestWidget = ({ data }: { data: { id: string } }) => {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingKind, setUpdatingKind] = useState<Kind | null>(null)
  const [creatingKind, setCreatingKind] = useState<Kind | null>(null)

  const backend = (
    typeof window !== "undefined"
      ? (process.env.BACKEND_URL || window.location.origin)
      : ""
  ).replace(/\/$/, "")

  const fetchProduct = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/admin/products/${data.id}`, {
        credentials: "include",
      })
      const json = await res.json()
      setProduct(json?.product || null)
    } catch (error) {
      console.error("Failed to fetch product metadata:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProduct()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id])

  const meta = (product?.metadata || {}) as ProductMetadata

  const requests = (["category", "collection"] as Kind[]).filter((kind) => {
    const remark = (
      (meta[KIND_CONFIG[kind].metaKeys.remark] as string | undefined) || ""
    ).trim()
    return !!remark
  })

  if (!loading && requests.length === 0) return null

  // ── One-click: Create & Assign category (subcategory-aware) ──────────────
  const handleCreateCategory = async () => {
    if (!product) return
    const request = meta.category_request?.trim()
    if (!request) return
    setCreatingKind("category")
    try {
      // Parse "Parent > Sub" format written by the bulk-upload flow
      const parts = request.split(">").map((p) => p.trim()).filter(Boolean)
      // Also handle "Sub (under Parent)" format
      const underMatch = parts[0]?.match(/^(.+?)\s*\(under\s+(.+?)\)$/)
      let parentName: string | null = null
      let categoryName: string

      if (underMatch) {
        categoryName = underMatch[1].trim()
        parentName = underMatch[2].trim()
      } else if (parts.length > 1) {
        parentName = parts[0]
        categoryName = parts[parts.length - 1]
      } else {
        categoryName = parts[0]
      }

      let parentId: string | null = null

      if (parentName) {
        // Try to find an existing parent category
        const listRes = await fetch(
          `${backend}/admin/product-categories?q=${encodeURIComponent(parentName)}&limit=20`,
          { credentials: "include" }
        )
        if (listRes.ok) {
          const listData = await listRes.json()
          const match = (listData.product_categories || []).find(
            (c: any) => c.name.toLowerCase() === parentName!.toLowerCase()
          )
          parentId = match?.id ?? null
        }
        // Create parent if not found
        if (!parentId) {
          const createParentRes = await fetch(`${backend}/admin/product-categories`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: parentName,
              handle: toHandle(parentName),
              is_active: true,
            }),
          })
          if (!createParentRes.ok) throw new Error("Failed to create parent category")
          const createParentData = await createParentRes.json()
          parentId = createParentData.product_category?.id ?? null
        }
      }

      // Build a unique handle; prefix subcategories with the parent handle
      const categoryHandle = parentId
        ? `${toHandle(parentName ?? categoryName)}-${toHandle(categoryName)}`
        : toHandle(categoryName)

      // Check if this category already exists — reuse it to avoid 400s
      let newCatId: string | null = null
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
        if (existing) newCatId = existing.id
      }

      // Create subcategory if it doesn't already exist
      if (!newCatId) {
        const createRes = await fetch(`${backend}/admin/product-categories`, {
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
        if (!createRes.ok) throw new Error("Failed to create category")
        const createData = await createRes.json()
        newCatId = createData.product_category?.id ?? null
      }

      if (!newCatId) throw new Error("No category id returned")

      // Assign new category to the product + mark resolved
      const existingCatIds = (product.categories || []).map((c) => ({ id: c.id }))
      const updateRes = await fetch(`${backend}/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: [...existingCatIds, { id: newCatId }],
          metadata: {
            ...meta,
            category_request_status: "resolved",
            category_request_resolved_at: new Date().toISOString(),
          },
        }),
      })
      if (!updateRes.ok) throw new Error("Failed to assign category to product")

      toast.success("Category created & assigned", {
        description: parentName
          ? `"${categoryName}" created under "${parentName}" and assigned to this product.`
          : `"${categoryName}" created and assigned to this product.`,
      })
      fetchProduct()
    } catch (err: any) {
      console.error("Create category failed:", err)
      toast.error("Failed to create category", {
        description: err?.message || "Please try again.",
      })
    } finally {
      setCreatingKind(null)
    }
  }

  // ── One-click: Create & Assign collection ────────────────────────────────
  const handleCreateCollection = async () => {
    if (!product) return
    const request = meta.collection_request?.trim()
    if (!request) return
    setCreatingKind("collection")
    try {
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

      const updateRes = await fetch(`${backend}/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: newColId,
          metadata: {
            ...meta,
            collection_request_status: "resolved",
            collection_request_resolved_at: new Date().toISOString(),
          },
        }),
      })
      if (!updateRes.ok) throw new Error("Failed to assign collection to product")

      toast.success("Collection created & assigned", {
        description: `"${request}" created and assigned to this product.`,
      })
      fetchProduct()
    } catch (err: any) {
      console.error("Create collection failed:", err)
      toast.error("Failed to create collection", {
        description: err?.message || "Please try again.",
      })
    } finally {
      setCreatingKind(null)
    }
  }

  // ── Mark resolved / reopen ────────────────────────────────────────────────
  const updateRequestStatus = async (kind: Kind, status: "pending" | "resolved") => {
    if (!product) return
    if (
      status === "resolved" &&
      !confirm(
        `Mark this ${KIND_CONFIG[kind].label} request as resolved? The vendor's note will stay on the product for reference, but it will no longer appear as pending.`
      )
    ) {
      return
    }
    setUpdatingKind(kind)
    try {
      const { metaKeys } = KIND_CONFIG[kind]
      const res = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            ...meta,
            [metaKeys.status]: status,
            [metaKeys.resolvedAt]:
              status === "resolved" ? new Date().toISOString() : null,
          },
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.message || "Failed to update request")
      }
      toast.success(status === "resolved" ? "Marked resolved" : "Reopened", {
        description:
          status === "resolved"
            ? `The ${KIND_CONFIG[kind].label} request is now hidden from the pending list.`
            : `The ${KIND_CONFIG[kind].label} request is back in pending state.`,
      })
      fetchProduct()
    } catch (error: any) {
      console.error(`Failed to update ${kind} request:`, error)
      toast.error("Could not update", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setUpdatingKind(null)
    }
  }

  if (loading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          Loading vendor requests…
        </Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      {requests.map((kind, i) => {
        const cfg = KIND_CONFIG[kind]
        const remark = (
          (meta[cfg.metaKeys.remark] as string | undefined) || ""
        ).trim()
        const status =
          typeof meta[cfg.metaKeys.status] === "string"
            ? (meta[cfg.metaKeys.status] as string)
            : "pending"
        const isResolved = status === "resolved"
        const excelValue =
          (meta[cfg.metaKeys.excel] as string | null | undefined) || ""
        const submittedAt = formatTimestamp(
          meta[cfg.metaKeys.submittedAt] as string | undefined
        )
        const resolvedAt = formatTimestamp(
          meta[cfg.metaKeys.resolvedAt] as string | undefined
        )
        const updating = updatingKind === kind
        const creating = creatingKind === kind

        return (
          <div key={kind} className={i > 0 ? "border-t" : ""}>
            <div className="px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Heading level="h2">
                  {kind === "category"
                    ? "Category request from vendor"
                    : "Collection request from vendor"}
                </Heading>
                <Badge color={isResolved ? "green" : "orange"}>
                  {isResolved ? "Resolved" : "Pending"}
                </Badge>
              </div>
              {!isResolved && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => window.open(cfg.sectionUrl, "_blank")}
                >
                  Open {kind === "category" ? "Categories" : "Collections"}
                </Button>
              )}
            </div>

            <div className="px-6 pb-4 space-y-3">
              <div>
                <Text
                  size="xsmall"
                  className="text-ui-fg-subtle uppercase tracking-wide font-medium"
                >
                  Vendor's remark
                </Text>
                <div className="mt-1 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm whitespace-pre-wrap">
                  {remark}
                </div>
              </div>

              {excelValue && (
                <div>
                  <Text
                    size="xsmall"
                    className="text-ui-fg-subtle uppercase tracking-wide font-medium"
                  >
                    Original Excel value
                  </Text>
                  <div className="mt-1 font-mono text-xs text-ui-fg-base">
                    {excelValue}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ui-fg-subtle">
                {submittedAt && (
                  <div>
                    <span className="font-medium">Submitted:</span>{" "}
                    {submittedAt}
                  </div>
                )}
                {isResolved && resolvedAt && (
                  <div>
                    <span className="font-medium">Resolved:</span>{" "}
                    {resolvedAt}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!isResolved ? (
                  <>
                    {/* Primary action: create the entity and assign it instantly */}
                    <Button
                      variant="primary"
                      size="small"
                      disabled={creating || updating}
                      onClick={
                        kind === "category"
                          ? handleCreateCategory
                          : handleCreateCollection
                      }
                    >
                      {creating
                        ? "Creating…"
                        : kind === "category"
                        ? "✚ Create & Assign Category"
                        : "✚ Create & Assign Collection"}
                    </Button>

                    {/* Secondary: manual resolve (e.g. if admin handled it elsewhere) */}
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => updateRequestStatus(kind, "resolved")}
                      disabled={updating || creating}
                    >
                      {updating ? "Saving…" : "Mark as resolved"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => updateRequestStatus(kind, "pending")}
                    disabled={updating}
                  >
                    {updating ? "Saving…" : "Reopen"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default ProductCategoryRequestWidget
