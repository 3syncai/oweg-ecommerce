"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge, Button, Container, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import VariantMatrixEditor from "@/components/VariantMatrixEditor"
import { vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi, vendorInventoryApi } from "@/lib/api/client"
import {
  collectAllImageUrls,
  detectVisualOption,
  serializeColorImages,
  type ProductOptionDef,
  type UploadedImageRef,
  type VariantMatrixRow,
} from "@/lib/variant-matrix"
import { buildUsedSkuSet, validateProductSkus } from "@/lib/sku-validation"
import { useParams, useRouter } from "next/navigation"

type Product = {
  id: string
  title: string
  description?: string | null
  handle?: string | null
  status: string
  created_at: string
  updated_at: string
  thumbnail?: string | null
  images?: Array<{ url: string }>
  metadata?: Record<string, any>
  categories?: Array<{ id: string; name?: string }>
  collection_id?: string | null
  collection?: { id: string; title?: string } | null
}

type VariantSummary = {
  id: string
  title: string | null
  sku: string | null
  price: number | null
  discounted_price: number | null
  discounted_price_list_id: string | null
  currency_code: string
}

type CatalogCategory = {
  id: string
  name: string
}

type CatalogCollection = {
  id: string
  title: string
}

type EditFormData = {
  title: string
  description: string
  handle: string
  price: string
  discountedPrice: string
  categoryId: string
  collectionId: string
  vendorRemark: string
}

const EMPTY_FORM: EditFormData = {
  title: "",
  description: "",
  handle: "",
  price: "",
  discountedPrice: "",
  categoryId: "",
  collectionId: "",
  vendorRemark: "",
}

const VendorProductEditPage = () => {
  const router = useRouter()
  const params = useParams()
  const productId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [variantSummary, setVariantSummary] = useState<VariantSummary | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [collections, setCollections] = useState<CatalogCollection[]>([])
  const [formData, setFormData] = useState<EditFormData>(EMPTY_FORM)
  const [initialFormData, setInitialFormData] = useState<EditFormData>(EMPTY_FORM)
  const [hasVariants, setHasVariants] = useState(false)
  const [productOptions, setProductOptions] = useState<ProductOptionDef[]>([])
  const [variantRows, setVariantRows] = useState<VariantMatrixRow[]>([])
  const [initialVariantRows, setInitialVariantRows] = useState<VariantMatrixRow[]>([])
  const [colorImages, setColorImages] = useState<Record<string, UploadedImageRef[]>>({})
  const [initialColorImages, setInitialColorImages] = useState<Record<string, UploadedImageRef[]>>({})
  const [primaryVisualOption, setPrimaryVisualOption] = useState("")
  const [usedSkus, setUsedSkus] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!productId) {
      router.push("/products")
      return
    }

    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadPageData = async () => {
      setLoadError(null)
      try {
        const [productResponse, categoriesResponse, collectionsResponse, inventoryResponse] =
          await Promise.all([
          vendorProductsApi.get(productId),
          vendorCategoriesApi.list({ limit: 100, offset: 0 }).catch(() => ({ product_categories: [] })),
          vendorCollectionsApi.list({ limit: 100, offset: 0 }).catch(() => ({ collections: [] })),
          vendorInventoryApi.list().catch(() => ({ success: false, inventory: [] })),
        ])

        const prod = (productResponse as any)?.product as Product
        const summary = (productResponse as any)?.variant_summary as VariantSummary | null
        const matrix = (productResponse as any)?.variant_matrix as {
          options?: Array<{ title: string; values: string[] }>
          variants?: Array<{
            id: string
            title: string | null
            sku: string | null
            manage_inventory: boolean
            allow_backorder: boolean
            inventory_quantity: number | null
            price: number | null
            discounted_price: number | null
            option_values: Record<string, string>
          }>
        } | null
        const loadedColorImages = ((productResponse as any)?.color_images || {}) as Record<
          string,
          string[]
        >
        const loadedPrimaryVisual = (productResponse as any)?.primary_visual_option as string | undefined

        if (!prod) {
          setLoading(false)
          return
        }

        const loadedCategories = (categoriesResponse as any)?.product_categories || []
        const loadedCollections = (collectionsResponse as any)?.collections || []

        setProduct(prod)
        setVariantSummary(summary || null)
        setCategories(loadedCategories)
        setCollections(loadedCollections)
        if ((inventoryResponse as any)?.success) {
          setUsedSkus(
            buildUsedSkuSet((inventoryResponse as any).inventory || [], productId)
          )
        }

        const existingCategoryId =
          prod?.categories?.[0]?.id ||
          (Array.isArray(prod?.metadata?.categories) ? prod.metadata.categories[0] : "") ||
          ""
        const existingCollectionId =
          prod?.collection_id ||
          prod?.collection?.id ||
          prod?.metadata?.collection_id ||
          ""

        const nextForm: EditFormData = {
          title: prod.title || "",
          description: prod.description || "",
          handle: prod.handle || "",
          price: summary?.price != null ? String(summary.price) : "",
          discountedPrice: summary?.discounted_price != null ? String(summary.discounted_price) : "",
          categoryId: existingCategoryId,
          collectionId: existingCollectionId,
          vendorRemark: "",
        }

        setFormData(nextForm)
        setInitialFormData(nextForm)

        const optionDefs: ProductOptionDef[] = (matrix?.options || []).map((opt) => ({
          title: opt.title,
          values: opt.values,
          valuesInput: opt.values.join(", "),
        }))
        const rows: VariantMatrixRow[] = (matrix?.variants || []).map((variant) => ({
          id: variant.id,
          title: variant.title || Object.values(variant.option_values).join(" / "),
          sku: variant.sku || "",
          managedInventory: variant.manage_inventory,
          allowBackorder: variant.allow_backorder,
          inventoryCount:
            variant.inventory_quantity != null ? String(variant.inventory_quantity) : "",
          price: variant.price != null ? String(variant.price) : "",
          discountedPrice:
            variant.discounted_price != null ? String(variant.discounted_price) : "",
          optionValues: variant.option_values || {},
        }))

        const mappedColorImages: Record<string, UploadedImageRef[]> = {}
        for (const [key, urls] of Object.entries(loadedColorImages)) {
          mappedColorImages[key] = urls.map((url, index) => ({
            url,
            filename: `${key}-${index + 1}`,
            originalName: `${key}-${index + 1}`,
          }))
        }

        const productHasVariants = rows.length > 1 || optionDefs.length > 0
        setHasVariants(productHasVariants)
        setProductOptions(optionDefs)
        setVariantRows(rows)
        setInitialVariantRows(rows)
        setColorImages(mappedColorImages)
        setInitialColorImages(mappedColorImages)
        setPrimaryVisualOption(
          loadedPrimaryVisual || detectVisualOption(optionDefs.map((o) => o.title)) || ""
        )
      } catch (e: any) {
        if (e?.status === 403) {
          router.push("/pending")
          return
        }

        const message = e?.message || "Failed to load product details"
        setLoadError(message)
        toast.error("Error", { description: message })
      } finally {
        setLoading(false)
      }
    }

    loadPageData()
  }, [productId, router])

  const changedFields = useMemo(() => {
    const changes: string[] = []

    if (formData.title.trim() !== initialFormData.title.trim()) changes.push("title")
    if (formData.description.trim() !== initialFormData.description.trim()) changes.push("description")
    if (formData.handle.trim() !== initialFormData.handle.trim()) changes.push("handle")
    if (formData.price.trim() !== initialFormData.price.trim()) changes.push("price")
    if (formData.discountedPrice.trim() !== initialFormData.discountedPrice.trim()) changes.push("discounted_price")
    if (formData.categoryId !== initialFormData.categoryId) changes.push("category")
    if (formData.collectionId !== initialFormData.collectionId) changes.push("collection")

    return changes
  }, [formData, initialFormData])

  const variantRowsChanged = useMemo(() => {
    return JSON.stringify(variantRows) !== JSON.stringify(initialVariantRows)
  }, [variantRows, initialVariantRows])

  const colorImagesChanged = useMemo(() => {
    return JSON.stringify(serializeColorImages(colorImages)) !== JSON.stringify(serializeColorImages(initialColorImages))
  }, [colorImages, initialColorImages])

  const hasChanges = changedFields.length > 0 || variantRowsChanged || colorImagesChanged

  const selectedCategoryName = useMemo(() => {
    return categories.find((c) => c.id === formData.categoryId)?.name || ""
  }, [categories, formData.categoryId])

  const selectedCollectionTitle = useMemo(() => {
    return collections.find((c) => c.id === formData.collectionId)?.title || ""
  }, [collections, formData.collectionId])

  const handleFieldChange = (field: keyof EditFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hasChanges) {
      toast.warning("No changes", { description: "Update at least one field before saving" })
      return
    }

    if (!formData.vendorRemark.trim()) {
      toast.error("Remark required", {
        description: "Please mention what you changed so admin can review quickly.",
      })
      return
    }

    const parsedPrice = Number(formData.price)
    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Invalid price", { description: "Enter a valid price greater than 0." })
      return
    }
    const hasDiscountedValue = formData.discountedPrice.trim().length > 0
    const parsedDiscountedPrice = hasDiscountedValue ? Number(formData.discountedPrice) : null
    if (hasDiscountedValue && (!Number.isFinite(parsedDiscountedPrice) || (parsedDiscountedPrice as number) <= 0)) {
      toast.error("Invalid discounted price", { description: "Enter a valid discounted price greater than 0." })
      return
    }
    if (hasDiscountedValue && (parsedDiscountedPrice as number) >= parsedPrice) {
      toast.error("Invalid discounted price", {
        description: "Discounted price must be less than original price.",
      })
      return
    }

    setSaving(true)

    try {
      if (hasVariants && (variantRowsChanged || colorImagesChanged)) {
        const skuValidation = validateProductSkus(
          variantRows.map((row) => row.sku),
          usedSkus
        )
        if (!skuValidation.ok) {
          toast.error(skuValidation.title, { description: skuValidation.description })
          setSaving(false)
          return
        }

        const serializedColorImages = serializeColorImages(colorImages)
        const allImageUrls = collectAllImageUrls([], colorImages)

        await vendorProductsApi.updateVariants(productId, {
          variants: variantRows.map((row) => ({
            id: row.id,
            sku: row.sku || null,
            manage_inventory: row.managedInventory,
            inventory_quantity: Math.max(
              0,
              Math.floor(Number.parseInt(row.inventoryCount, 10)) || 0
            ),
            price: row.price ? Number(row.price) : undefined,
            discounted_price: row.discountedPrice ? Number(row.discountedPrice) : undefined,
          })),
          color_images: serializedColorImages,
          primary_visual_option: primaryVisualOption || undefined,
          images: allImageUrls.map((url) => ({ url })),
          vendor_edit_remark: formData.vendorRemark.trim(),
        })

        setInitialVariantRows(variantRows)
        setInitialColorImages(colorImages)
      }

      if (changedFields.length > 0) {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        handle: formData.handle.trim() || null,
        category_ids: formData.categoryId ? [formData.categoryId] : [],
        collection_id: formData.collectionId || null,
        ...(hasVariants
          ? {}
          : {
              price: parsedPrice,
              discounted_price: hasDiscountedValue ? parsedDiscountedPrice : undefined,
            }),
        vendor_edit_remark: formData.vendorRemark.trim(),
        metadata: {
          category: selectedCategoryName || null,
          categories: formData.categoryId ? [formData.categoryId] : [],
          collection_id: formData.collectionId || null,
          collection_title: selectedCollectionTitle || null,
          last_vendor_changed_fields: changedFields,
        },
      }

      const data = await vendorProductsApi.update(productId, payload)
      const updatedProduct = data?.product as Product | undefined

      if (updatedProduct) {
        setProduct(updatedProduct)
      }
      }

      const resetFormData = { ...formData, vendorRemark: "" }
      setInitialFormData({
        ...resetFormData,
        price: hasVariants ? initialFormData.price : String(parsedPrice),
        discountedPrice: hasVariants
          ? initialFormData.discountedPrice
          : hasDiscountedValue
            ? String(parsedDiscountedPrice)
            : "",
      })
      setFormData(resetFormData)

      toast.success("Updated", {
        description: "Product sent for admin approval again (Pending).",
      })
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
    try {
      await vendorProductsApi.delete(productId)
      toast.success("Deleted", { description: "Product deleted successfully" })
      router.push("/products")
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
        <Text>Loading product editor...</Text>
      </Container>
    )
  } else if (loadError) {
    content = (
      <Container className="p-6">
        <Text className="text-ui-fg-error">{loadError}</Text>
        <Button className="mt-4" variant="secondary" onClick={() => router.push("/products")}>
          Back to products
        </Button>
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
      <Container className="p-4 md:p-6 space-y-6">
        <div className="overflow-hidden rounded-2xl border border-ui-border-base bg-gradient-to-r from-emerald-900/30 via-cyan-900/20 to-slate-900/20 p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Text className="text-xs uppercase tracking-[0.18em] text-ui-fg-subtle font-['Space_Grotesk',var(--font-geist-sans)]">
                Vendor Product Review Flow
              </Text>
              <Heading level="h1" className="font-['Space_Grotesk',var(--font-geist-sans)]">
                Edit Product
              </Heading>
              <Text className="text-ui-fg-subtle">
                Save changes with a remark and this product automatically moves to pending admin approval.
              </Text>
            </div>

            <div className="flex items-center gap-2">
              <Badge color={product.metadata?.approval_status === "pending" ? "orange" : product.status === "published" ? "green" : "grey"}>
                {product.metadata?.approval_status || product.status}
              </Badge>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-ui-border-base bg-ui-bg-component p-5 md:p-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange("title", e.target.value)}
                  required
                  placeholder="Enter product title"
                />
              </div>

              {!hasVariants && (
                <>
              <div className="space-y-2">
                <Label>Price (INR) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.price}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange("price", e.target.value)}
                  placeholder="e.g. 999"
                  required
                />
                <Text className="text-xs text-ui-fg-subtle">
                  Updates the base selling price of the default variant.
                </Text>
              </div>

              <div className="space-y-2">
                <Label>Discounted Price (INR)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.discountedPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange("discountedPrice", e.target.value)}
                  placeholder="e.g. 899"
                />
              </div>
                </>
              )}

              {hasVariants && (
                <div className="space-y-2 md:col-span-2">
                  <Text className="text-sm text-ui-fg-subtle">
                    This product uses a variant matrix. Edit prices and stock in the section below.
                  </Text>
                </div>
              )}

              <div className="space-y-2">
                <Label>Handle</Label>
                <Input
                  value={formData.handle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange("handle", e.target.value)}
                  placeholder="url-friendly-handle"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => handleFieldChange("categoryId", e.target.value)}
                  className="h-10 w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-sm text-ui-fg-base outline-none transition focus:ring-2 focus:ring-ui-border-interactive"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Collection</Label>
                <select
                  value={formData.collectionId}
                  onChange={(e) => handleFieldChange("collectionId", e.target.value)}
                  className="h-10 w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-sm text-ui-fg-base outline-none transition focus:ring-2 focus:ring-ui-border-interactive"
                >
                  <option value="">Select collection</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange("description", e.target.value)}
                  rows={7}
                  placeholder="Add product details for customers"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Remark For Admin *</Label>
                <Textarea
                  value={formData.vendorRemark}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange("vendorRemark", e.target.value)}
                  rows={4}
                  placeholder="Example: Updated price from ₹899 to ₹999, changed title, moved to Electronics collection."
                  required
                />
                <Text className="text-xs text-ui-fg-subtle">
                  Admin will see this remark while verifying the product.
                </Text>
              </div>
            </div>

            {hasVariants && (
              <div className="border-t border-ui-border-base pt-5">
                <VariantMatrixEditor
                  hasVariants={hasVariants}
                  onHasVariantsChange={setHasVariants}
                  productOptions={productOptions}
                  onProductOptionsChange={setProductOptions}
                  variants={variantRows}
                  onVariantsChange={setVariantRows}
                  colorImages={colorImages}
                  onColorImagesChange={setColorImages}
                  primaryVisualOption={primaryVisualOption}
                  onPrimaryVisualOptionChange={setPrimaryVisualOption}
                  optionsReadOnly
                  usedSkus={usedSkus}
                />
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-ui-border-base pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={hasChanges ? "orange" : "grey"}>
                  {hasChanges ? `${changedFields.length} field(s) changed` : "No pending changes"}
                </Badge>
                {changedFields.map((field) => (
                  <Badge key={field} color="blue">
                    {field}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => router.push("/products")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !hasChanges}>
                  {saving ? "Saving & Sending..." : "Save & Send For Approval"}
                </Button>
              </div>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-component p-5">
              <Heading level="h2" className="mb-3 text-base font-['Space_Grotesk',var(--font-geist-sans)]">
                Quick Preview
              </Heading>
              <div className="space-y-3">
                <div className="h-40 overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle">
                  {(product.thumbnail || product.images?.[0]?.url) ? (
                    <img
                      src={product.thumbnail || product.images?.[0]?.url}
                      alt={formData.title || "Product image"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ui-fg-muted">
                      No image
                    </div>
                  )}
                </div>
                <Text className="font-medium">{formData.title || "Untitled product"}</Text>
                <div className="flex items-center gap-2">
                  <Text className="text-ui-fg-subtle text-sm">₹ {formData.price || "--"}</Text>
                  {formData.discountedPrice && (
                    <Text className="text-emerald-500 text-sm font-medium">
                      Sale ₹ {formData.discountedPrice}
                    </Text>
                  )}
                </div>
                {variantSummary?.sku && (
                  <Text className="text-xs text-ui-fg-subtle">SKU: {variantSummary.sku}</Text>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-component p-5">
              <Heading level="h2" className="mb-3 text-base font-['Space_Grotesk',var(--font-geist-sans)]">
                Approval Steps
              </Heading>
              <div className="space-y-2 text-sm text-ui-fg-subtle">
                <Text>1. Vendor edits fields and adds remark.</Text>
                <Text>2. Product status switches to pending.</Text>
                <Text>3. Admin reviews remark + changes, then approves or rejects.</Text>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorProductEditPage
