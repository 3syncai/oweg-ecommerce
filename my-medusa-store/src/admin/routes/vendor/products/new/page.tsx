"use client"

import { useState, useEffect } from "react"
import { Heading, Text, Button, Input, Textarea, Label, Switch, toast } from "@medusajs/ui"
import { CheckCircleSolid, CircleMiniSolid } from "@medusajs/icons"
import VendorShell from "../../../../components/VendorShell"

type ProductFormData = {
  // Details
  title: string
  subtitle: string
  handle: string
  description: string
  media: File[]
  hasVariants: boolean
  
  // Organize
  discountable: boolean
  type: string
  collection: string
  categories: string[]
  tags: string[]
  shippingProfile: string
  salesChannels: string[]
  
  // Variants
  variants: Array<{
    title: string
    sku: string
    managedInventory: boolean
    allowBackorder: boolean
    hasInventoryKit: boolean
    price: string
  }>
}

type Step = "details" | "organize" | "variants"

const VendorProductNewPage = () => {
  const [currentStep, setCurrentStep] = useState<Step>("details")
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  
  const [formData, setFormData] = useState<ProductFormData>({
    title: "",
    subtitle: "",
    handle: "",
    description: "",
    media: [],
    hasVariants: false,
    discountable: true,
    type: "",
    collection: "",
    categories: [],
    tags: [],
    shippingProfile: "",
    salesChannels: ["Default Sales Channel"],
    variants: [{
      title: "Default variant",
      sku: "",
      managedInventory: false,
      allowBackorder: false,
      hasInventoryKit: false,
      price: "",
    }],
  })

  useEffect(() => {
    fetchCategoriesAndCollections()
  }, [])

  const fetchCategoriesAndCollections = async () => {
    try {
      const token = localStorage.getItem("vendor_token")
      if (!token) return

      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      
      const [categoriesRes, collectionsRes] = await Promise.all([
        fetch(`${backend}/vendor/categories?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${backend}/vendor/collections?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (categoriesRes.ok) {
        const data = await categoriesRes.json()
        setCategories(data.product_categories || [])
      }

      if (collectionsRes.ok) {
        const data = await collectionsRes.json()
        setCollections(data.collections || [])
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    }
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      setFormData({ ...formData, media: files })
      toast.success("Success", { description: `${files.length} file(s) selected` })
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      setFormData({ ...formData, media: files })
      toast.success("Success", { description: `${files.length} file(s) selected` })
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleNext = () => {
    if (currentStep === "details") {
      if (!formData.title) {
        toast.error("Error", { description: "Title is required" })
        return
      }
      setCurrentStep("organize")
    } else if (currentStep === "organize") {
      setCurrentStep("variants")
    }
  }

  const handleBack = () => {
    if (currentStep === "organize") {
      setCurrentStep("details")
    } else if (currentStep === "variants") {
      setCurrentStep("organize")
    }
  }

  const handleSubmit = async () => {
    setLoading(true)

    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      toast.error("Error", { description: "Not authenticated" })
      window.location.href = "/app/login"
      return
    }

    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    try {
      // First, upload images if any
      let imageUrls: string[] = []
      if (formData.media && formData.media.length > 0) {
        const formDataToSend = new FormData()
        formData.media.forEach((file) => {
          formDataToSend.append("files", file)
        })

        try {
          const uploadRes = await fetch(`${backend}/vendor/products/upload-image`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${vendorToken}`,
            },
            body: formDataToSend,
          })

          if (!uploadRes.ok) {
            const errorData = await uploadRes.json().catch(() => ({}))
            throw new Error(errorData?.message || "Failed to upload images")
          }

          const uploadData = await uploadRes.json()
          imageUrls = uploadData.files?.map((f: any) => f.url) || []
        } catch (uploadError: any) {
          throw new Error(`Image upload failed: ${uploadError.message}`)
        }
      }

      // Prepare variant data - create a default variant if no variants specified
      const variants = formData.variants && formData.variants.length > 0
        ? formData.variants.map((v) => ({
            title: v.title || "Default variant",
            sku: v.sku || undefined,
            manage_inventory: v.managedInventory,
            allow_backorder: v.allowBackorder,
            prices: v.price ? [
              {
                amount: Math.round(parseFloat(v.price) * 100), // Convert to cents/paise
                currency_code: "inr",
              }
            ] : [],
            inventory_quantity: v.managedInventory ? 0 : undefined,
          }))
        : [
            {
              title: "Default variant",
              prices: [],
            }
          ]

      // Create product
      const res = await fetch(`${backend}/vendor/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          subtitle: formData.subtitle || null,
          description: formData.description || null,
          handle: formData.handle || null,
          is_giftcard: false,
          discountable: formData.discountable !== false,
          category_ids: formData.categories || [],
          collection_id: formData.collection || null,
          tags: formData.tags || [],
          images: imageUrls.map((url) => ({ url })),
          options: [], // No product options for simple products
          variants: variants,
          shipping_profile_id: formData.shippingProfile || null,
          metadata: {
            categories: formData.categories,
            tags: formData.tags,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error?.message || "Failed to create product")
      }

      toast.success("Success", { description: "Product created successfully" })
      window.location.href = "/app/vendor/products"
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to create product" })
    } finally {
      setLoading(false)
    }
  }

  const renderStepIndicator = () => {
    const isDetailsComplete = currentStep === "organize" || currentStep === "variants"
    const isOrganizeComplete = currentStep === "variants"

  return (
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <button
          onClick={() => setCurrentStep("details")}
          style={{
            flex: 1,
            padding: "12px 20px",
            background: currentStep === "details" ? "#60a5fa" : "transparent",
            border: "none",
            borderRadius: 8,
            color: currentStep === "details" ? "white" : "var(--fg-base)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 15,
          }}
        >
          <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isDetailsComplete ? (
              <CheckCircleSolid style={{ color: "#60a5fa" }} />
            ) : (
              <CircleMiniSolid style={{ color: currentStep === "details" ? "white" : "var(--fg-muted)" }} />
            )}
          </span>
          <span style={{ fontWeight: 500 }}>Details</span>
        </button>

        <button
          onClick={() => formData.title && setCurrentStep("organize")}
          disabled={!formData.title}
          style={{
            flex: 1,
            padding: "12px 20px",
            background: currentStep === "organize" ? "#60a5fa" : "transparent",
            border: "none",
            borderRadius: 8,
            color: currentStep === "organize" ? "white" : "var(--fg-base)",
            cursor: formData.title ? "pointer" : "not-allowed",
            opacity: formData.title ? 1 : 0.5,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 15,
          }}
        >
          <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isOrganizeComplete ? (
              <CheckCircleSolid style={{ color: "#60a5fa" }} />
            ) : (
              <CircleMiniSolid style={{ color: currentStep === "organize" ? "white" : "var(--fg-muted)" }} />
            )}
          </span>
          <span style={{ fontWeight: 500 }}>Organize</span>
        </button>

        <button
          onClick={() => formData.title && setCurrentStep("variants")}
          disabled={!formData.title}
          style={{
            flex: 1,
            padding: "12px 20px",
            background: currentStep === "variants" ? "#60a5fa" : "transparent",
            border: "none",
            borderRadius: 8,
            color: currentStep === "variants" ? "white" : "var(--fg-base)",
            cursor: formData.title ? "pointer" : "not-allowed",
            opacity: formData.title ? 1 : 0.5,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 15,
          }}
        >
          <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircleMiniSolid style={{ color: currentStep === "variants" ? "white" : "var(--fg-muted)" }} />
          </span>
          <span style={{ fontWeight: 500 }}>Variants</span>
        </button>
      </div>
    )
  }

  const renderDetailsStep = () => (
    <div style={{ maxWidth: 1200 }}>
      <Heading level="h2" style={{ marginBottom: 16 }}>General</Heading>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <Label>Title</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Winter jacket"
            required
          />
        </div>

        <div>
          <Label>
            Subtitle <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <Input
            value={formData.subtitle}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
            placeholder="Warm and cozy"
          />
        </div>

        <div>
          <Label>
            Handle <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--fg-muted)" }}>/</span>
          <Input
            value={formData.handle}
            onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
              placeholder="winter-jacket"
          />
          </div>
        </div>
        </div>

      <div style={{ marginBottom: 32 }}>
        <Label>
          Description <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
        </Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="A warm and cozy jacket"
          rows={4}
          />
        </div>

      <div>
        <Label>
          Media <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
        </Label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleMediaUpload}
          style={{ display: "none" }}
          id="media-upload"
        />
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => {
            const fileInput = document.getElementById("media-upload")
            if (fileInput) {
              fileInput.click()
            }
          }}
          style={{
            border: "2px dashed var(--border-base)",
            borderRadius: 8,
            padding: 48,
            textAlign: "center",
            background: "var(--bg-base)",
            cursor: "pointer",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto", color: "var(--fg-muted)" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <Text weight="plus" style={{ marginBottom: 4 }}>Upload images</Text>
          <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 16 }}>
            Drag and drop images here or click to upload.
          </Text>
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              const fileInput = document.getElementById("media-upload")
              if (fileInput) {
                fileInput.click()
              }
            }}
          >
            Choose files
          </Button>
        </div>
        {formData.media.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text size="small" weight="plus" style={{ marginBottom: 8, display: "block" }}>
              {formData.media.length} file(s) selected:
            </Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {formData.media.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-base)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text size="small">{file.name}</Text>
                  <button
                    onClick={() => {
                      const newMedia = formData.media.filter((_, i) => i !== idx)
                      setFormData({ ...formData, media: newMedia })
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--fg-muted)",
                      fontSize: 18,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderOrganizeStep = () => (
    <div style={{ maxWidth: 1200 }}>
      <Heading level="h2" style={{ marginBottom: 16 }}>Organize</Heading>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "var(--bg-base)", borderRadius: 8, marginBottom: 24 }}>
        <Switch
          checked={formData.discountable}
          onCheckedChange={(checked) => setFormData({ ...formData, discountable: checked })}
        />
        <div>
          <Text weight="plus">
            Discountable <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Text>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            When unchecked, discounts will not be applied to this product
          </Text>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <Label>
            Type <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <Input
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            placeholder="Select type"
          />
        </div>

        <div>
          <Label>
            Collection <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <select
            value={formData.collection}
            onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: 8,
              color: "var(--fg-base)",
            }}
          >
            <option value="">Select collection</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <Label>
            Categories <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <select
            value={formData.categories[0] || ""}
            onChange={(e) => {
              setFormData({ ...formData, categories: e.target.value ? [e.target.value] : [] })
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: 8,
              color: "var(--fg-base)",
              cursor: "pointer",
            }}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>
            Tags <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <Input
            value={formData.tags.join(", ")}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(",").map(t => t.trim()).filter(t => t) })}
            placeholder="winter, jacket, outdoor"
          />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Label>
          Shipping profile <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
        </Label>
        <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 8 }}>
          Connect the product to a shipping profile
        </Text>
        <Input
          value={formData.shippingProfile}
          onChange={(e) => setFormData({ ...formData, shippingProfile: e.target.value })}
          placeholder="Select shipping profile"
        />
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <Label>
              Sales channels <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
            </Label>
            <Text size="small" style={{ color: "var(--fg-muted)" }}>
              This product will only be available in the default sales channel if left untouched.
            </Text>
          </div>
          <Button variant="secondary" size="small">
            Add
          </Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {formData.salesChannels.map((channel, idx) => (
            <div
              key={idx}
              style={{
                padding: "6px 12px",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-base)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text size="small">{channel}</Text>
              <button
                onClick={() => {
                  const newChannels = formData.salesChannels.filter((_, i) => i !== idx)
                  setFormData({ ...formData, salesChannels: newChannels })
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--fg-muted)",
                }}
              >
                ×
              </button>
            </div>
          ))}
          {formData.salesChannels.length === 0 && (
            <Text size="small" style={{ color: "var(--fg-muted)" }}>
              No sales channels selected
            </Text>
          )}
        </div>
        <Button
          variant="transparent"
          size="small"
          style={{ marginTop: 8 }}
          onClick={() => setFormData({ ...formData, salesChannels: [] })}
        >
          Clear all
        </Button>
      </div>
    </div>
  )

  const renderVariantsStep = () => (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <Button variant="secondary" size="small">
            <span style={{ marginRight: 8 }}>☰</span>
            View
          </Button>
        </div>
        <Text size="small" style={{ color: "var(--fg-muted)" }}>
          Shortcuts
        </Text>
      </div>

      <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border-base)" }}>
            <tr>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Default option
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Title
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                SKU
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Managed inventory
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Allow backorder
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Has inventory kit
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                Price INR
              </th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
                
              </th>
            </tr>
          </thead>
          <tbody>
            {formData.variants.map((variant, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid var(--border-base)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Text size="small">Default option value</Text>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Input
                    value={variant.title}
                    onChange={(e) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].title = e.target.value
                      setFormData({ ...formData, variants: newVariants })
                    }}
                    placeholder="Default variant"
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Input
                    value={variant.sku}
                    onChange={(e) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].sku = e.target.value
                      setFormData({ ...formData, variants: newVariants })
                    }}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={variant.managedInventory}
                    onChange={(e) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].managedInventory = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={variant.allowBackorder}
                    onChange={(e) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].allowBackorder = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={variant.hasInventoryKit}
                    onChange={(e) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].hasInventoryKit = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--fg-muted)" }}>₹</span>
                    <Input
                      value={variant.price}
                      onChange={(e) => {
                        const newVariants = [...formData.variants]
                        newVariants[idx].price = e.target.value
                        setFormData({ ...formData, variants: newVariants })
                      }}
                      placeholder="0.00"
                      style={{ width: 100 }}
                    />
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--fg-muted)",
                    }}
                  >
                    ⋮
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <VendorShell>
      <div style={{ padding: "24px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => (window.location.href = "/app/vendor/products")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-muted)",
              fontSize: 24,
              marginBottom: 16,
            }}
          >
            ×
          </button>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            esc
          </Text>
        </div>

        {renderStepIndicator()}

        {currentStep === "details" && renderDetailsStep()}
        {currentStep === "organize" && renderOrganizeStep()}
        {currentStep === "variants" && renderVariantsStep()}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border-base)" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {currentStep !== "details" && (
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => (window.location.href = "/app/vendor/products")}
          >
            Cancel
          </Button>
        </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="secondary" onClick={() => toast.info("Draft saved")}>
              Save as draft
            </Button>
            {currentStep === "variants" ? (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Publishing..." : "Publish"}
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </VendorShell>
  )
}

export default VendorProductNewPage
