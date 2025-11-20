"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Input, Textarea, Badge, toast } from "@medusajs/ui"
import VendorShell from "../../../../components/VendorShell"

type Product = {
  id: string
  title: string
  description?: string | null
  handle?: string | null
  status: string
  created_at: string
  updated_at: string
  images?: Array<{ url: string }>
  metadata?: {
    vendor_id?: string
  }
}

const VendorProductDetailPage = () => {
  // Extract product ID from URL
  const productId = typeof window !== 'undefined' 
    ? window.location.pathname.split('/').pop() || ''
    : ''
  
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    handle: "",
    category: "",
  })

  useEffect(() => {
    if (!productId) {
      window.location.href = "/app/vendor/products"
      return
    }

    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      window.location.href = "/app/login"
      return
    }

    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    const loadProduct = async () => {
      try {
        const res = await fetch(`${backend}/vendor/products/${productId}`, {
          headers: { Authorization: `Bearer ${vendorToken}` },
        })

        if (res.status === 403) {
          window.location.href = "/vendor/pending"
          return
        }

        if (!res.ok) {
          throw new Error(`Failed to load product: ${res.status}`)
        }

        const data = await res.json()
        const prod = data?.product
        setProduct(prod)
        if (prod) {
          setFormData({
            title: prod.title || "",
            description: prod.description || "",
            handle: prod.handle || "",
            category: (prod.metadata as any)?.category || "",
          })
        }
      } catch (e: any) {
        toast.error("Error", {
          description: e?.message || "Failed to load product",
        })
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [productId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const vendorToken = localStorage.getItem("vendor_token")
    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    try {
      const res = await fetch(`${backend}/vendor/products/${productId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          handle: formData.handle || null,
          metadata: {
            ...(product?.metadata || {}),
            category: formData.category || undefined,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error?.message || "Failed to update product")
      }

      const data = await res.json()
      setProduct(data?.product || null)
      toast.success("Success", { description: "Product updated successfully" })
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to update product" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
      return
    }

    setDeleting(true)

    const vendorToken = localStorage.getItem("vendor_token")
    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    try {
      const res = await fetch(`${backend}/vendor/products/${productId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
        },
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error?.message || "Failed to delete product")
      }

      toast.success("Success", { description: "Product deleted successfully" })
      window.location.href = "/app/vendor/products"
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to delete product" })
    } finally {
      setDeleting(false)
    }
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading product...</Text>
      </Container>
    )
  } else if (!product) {
    content = (
      <Container className="p-6">
        <Text className="text-ui-fg-error">Product not found</Text>
      </Container>
    )
  } else {
    content = (
      <Container className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Heading level="h1">Edit Product</Heading>
            <Text className="text-ui-fg-subtle">Update product details</Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={product.status === "published" ? "green" : "grey"}>{product.status}</Badge>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Title *
            </label>
            <Input
              value={formData.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Handle
            </label>
            <Input
              value={formData.handle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, handle: e.target.value })}
              placeholder="product-handle"
            />
            <Text className="text-ui-fg-subtle text-xs mt-1">URL-friendly identifier</Text>
          </div>

        <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Description
            </label>
            <Textarea
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
            />
          </div>

        <div>
          <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
            Category
          </label>
          <select
            value={formData.category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, category: e.target.value })}
            className="bg-ui-bg-base border border-ui-border-base rounded-md px-3 py-2 w-full"
          >
            <option value="">Select category</option>
            {["Apparel", "Electronics", "Home & Living", "Beauty", "Other"].map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

          {product.images && product.images.length > 0 && (
            <div>
              <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
                Images
              </label>
              <div className="flex gap-2 flex-wrap">
                {product.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img.url}
                    alt={`Product image ${idx + 1}`}
                    className="w-24 h-24 object-cover border border-ui-border-base rounded"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => (window.location.href = "/app/vendor/products")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorProductDetailPage

