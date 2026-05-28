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
 *   - link out to the right admin section (Categories / Collections),
 *   - mark each request as resolved once the entity exists / is assigned.
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

  // Don't render anything when there are no requests — keeps the product
  // page clean for products that came in through the regular flow.
  if (!loading && requests.length === 0) {
    return null
  }

  const updateRequestStatus = async (
    kind: Kind,
    status: "pending" | "resolved"
  ) => {
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
      toast.success(
        status === "resolved" ? "Marked resolved" : "Reopened",
        {
          description:
            status === "resolved"
              ? `The ${KIND_CONFIG[kind].label} request is now hidden from the pending list.`
              : `The ${KIND_CONFIG[kind].label} request is back in pending state.`,
        }
      )
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
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => updateRequestStatus(kind, "resolved")}
                    disabled={updating}
                  >
                    {updating ? "Saving…" : "Mark as resolved"}
                  </Button>
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

              <Text size="xsmall" className="text-ui-fg-subtle">
                Tip: create the requested {cfg.label} in{" "}
                <span className="font-medium">{cfg.hint}</span> and then
                assign it to this product, before marking the request
                resolved.
              </Text>
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
