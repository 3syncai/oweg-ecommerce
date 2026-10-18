import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { StatusBadge, Button, Container, Heading, Text } from "@medusajs/ui"
import { ArrowPath, ArrowUpRightOnBox, BuildingsSolid } from "@medusajs/icons"
import { useEffect, useState } from "react"

type VariantOffer = {
  id: string
  title?: string | null
  sku?: string | null
  price: number
  available: number | null
}

type VendorOffer = {
  product_id: string
  vendor_id: string
  vendor_name?: string | null
  store_name?: string | null
  email?: string | null
  vendor_approved: boolean
  product_status: string
  approval_status: string
  authorization_status: string
  minimum_price: number
  maximum_price: number
  available: number | null
  variants: VariantOffer[]
}

type Response = {
  catalog_product_id: string
  vendor_count: number
  vendors: VendorOffer[]
  message?: string
}

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

function statusColor(status: string): "green" | "orange" | "red" | "grey" {
  if (["approved", "published"].includes(status)) return "green"
  if (["rejected", "cancelled"].includes(status)) return "red"
  if (["pending", "draft"].includes(status)) return "orange"
  return "grey"
}

const ProductVendorOffersWidget = ({ data }: { data: { id: string } }) => {
  const [result, setResult] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/admin/products/${data.id}/vendor-offers`, { credentials: "include" })
      const payload = await response.json() as Response
      if (!response.ok) throw new Error(payload.message || "Could not load vendor offers")
      setResult(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load vendor offers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [data.id])

  return (
    <Container className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <Heading level="h2">Vendors selling this product</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {loading
              ? "Loading linked vendor listings..."
              : `${result?.vendor_count || 0} vendor${result?.vendor_count === 1 ? "" : "s"} linked to this catalog product`}
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => void load()} disabled={loading}>
          <ArrowPath className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      ) : loading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">Loading vendor listings...</Text>
        </div>
      ) : !loading && result?.vendors.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">No linked vendor listings found.</Text>
        </div>
      ) : (
        <div className="divide-y">
          {(result?.vendors || []).map((offer, index) => (
            <div key={offer.product_id} className="px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text weight="plus" className="break-words text-ui-fg-base">
                      {offer.store_name || offer.vendor_name || "Unnamed vendor"}
                    </Text>
                    {index === 0 && offer.minimum_price > 0 ? (
                      <StatusBadge color="green">Lowest price</StatusBadge>
                    ) : null}
                    {!offer.vendor_approved ? (
                      <StatusBadge color="orange">Vendor pending approval</StatusBadge>
                    ) : null}
                  </div>
                  <Text size="small" className="mt-1 break-all text-ui-fg-subtle">
                    {offer.email || offer.vendor_id}
                  </Text>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => window.location.assign(`/app/vendors/${offer.vendor_id}`)}
                  >
                    <BuildingsSolid className="mr-1.5 h-3.5 w-3.5" />
                    View vendor
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => window.location.assign(`/app/products/${offer.product_id}`)}
                  >
                    <ArrowUpRightOnBox className="mr-1.5 h-3.5 w-3.5" />
                    Open listing
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-x-6 gap-y-5 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Text size="xsmall" className="mb-1 text-ui-fg-subtle">PRICE</Text>
                  <Text weight="plus">
                    {offer.minimum_price > 0 ? money.format(offer.minimum_price) : "No price"}
                  </Text>
                  {offer.maximum_price > offer.minimum_price ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">to {money.format(offer.maximum_price)}</Text>
                  ) : null}
                </div>
                <div>
                  <Text size="xsmall" className="mb-1 text-ui-fg-subtle">STOCK</Text>
                  <Text weight="plus">{offer.available === null ? "Unlimited" : `${offer.available} available`}</Text>
                </div>
                <div className="min-w-0">
                  <Text size="xsmall" className="mb-1 text-ui-fg-subtle">VARIANTS / SKU</Text>
                  <div className="space-y-1">
                    {offer.variants.slice(0, 4).map((variant) => (
                      <Text key={variant.id} size="small" className="break-all">
                        {variant.title || "Default"}: {variant.sku || "No SKU"}
                        <span className="text-ui-fg-subtle">
                          {variant.available === null ? " · unlimited" : ` · ${variant.available} available`}
                        </span>
                      </Text>
                    ))}
                    {offer.variants.length > 4 ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">+{offer.variants.length - 4} more variants</Text>
                    ) : null}
                  </div>
                </div>
                <div>
                  <Text size="xsmall" className="mb-2 text-ui-fg-subtle">STATUS</Text>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge color={statusColor(offer.product_status)} className="capitalize">
                      {offer.product_status}
                    </StatusBadge>
                    {offer.approval_status !== "approved" ? (
                      <StatusBadge color={statusColor(offer.approval_status)} className="capitalize">
                        {offer.approval_status}
                      </StatusBadge>
                    ) : null}
                  </div>
                  <Text size="xsmall" className="mb-2 mt-4 text-ui-fg-subtle">BRAND LETTER</Text>
                  <StatusBadge color={statusColor(offer.authorization_status)}>
                    {offer.authorization_status === "approved"
                      ? "Approved"
                      : offer.authorization_status === "missing"
                        ? "Not uploaded"
                        : offer.authorization_status}
                  </StatusBadge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductVendorOffersWidget
