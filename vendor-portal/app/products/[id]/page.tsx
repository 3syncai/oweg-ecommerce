"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Badge,
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import VariantMatrixEditor from "@/components/VariantMatrixEditor"
import { vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi, vendorInventoryApi } from "@/lib/api/client"
import {
  collectAllImageUrls,
  detectVisualOption,
  isSimpleDefaultProduct,
  resolveProductOptionsFromRows,
  serializeColorImages,
  variantComboKey,
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
  const [approvalSentOpen, setApprovalSentOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [variantSummary, setVariantSummary] = useState<VariantSummary | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [collections, setCollections] = useState<CatalogCollection[]>([])
  const [formData, setFormData] = useState<EditFormData>(EMPTY_FORM)
  const [initialFormData, setInitialFormData] = useState<EditFormData>(EMPTY_FORM)
  const [hasVariants, setHasVariants] = useState(false)
  const [initialHasVariants, setInitialHasVariants] = useState(false)
  const [productOptions, setProductOptions] = useState<ProductOptionDef[]>([])
  const [initialProductOptions, setInitialProductOptions] = useState<ProductOptionDef[]>([])
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

        const productHasVariants = !isSimpleDefaultProduct(optionDefs, rows)
        setHasVariants(productHasVariants)
        setInitialHasVariants(productHasVariants)
        setProductOptions(productHasVariants ? optionDefs : [])
        setInitialProductOptions(productHasVariants ? optionDefs : [])
        setVariantRows(rows.length ? rows : [])
        setInitialVariantRows(rows.length ? rows : [])
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

  const productOptionsChanged = useMemo(() => {
    return JSON.stringify(productOptions) !== JSON.stringify(initialProductOptions)
  }, [productOptions, initialProductOptions])

  const colorImagesChanged = useMemo(() => {
    return JSON.stringify(serializeColorImages(colorImages)) !== JSON.stringify(serializeColorImages(initialColorImages))
  }, [colorImages, initialColorImages])

  const hasVariantsChanged = hasVariants !== initialHasVariants

  const hasChanges =
    changedFields.length > 0 ||
    variantRowsChanged ||
    productOptionsChanged ||
    colorImagesChanged ||
    hasVariantsChanged

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

    const simpleRow = variantRows[0]
    const simplePriceSource = hasVariants
      ? formData.price
      : simpleRow?.price?.trim() || formData.price
    const simpleSaleSource = hasVariants
      ? formData.discountedPrice
      : simpleRow?.discountedPrice?.trim() || formData.discountedPrice

    const parsedPrice = Number(simplePriceSource)
    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Invalid price", { description: "Enter a valid price greater than 0." })
      return
    }
    const hasDiscountedValue = (simpleSaleSource || "").trim().length > 0
    const parsedDiscountedPrice = hasDiscountedValue ? Number(simpleSaleSource) : null
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

    if (hasVariants) {
      if (!variantRows.length) {
        toast.error("No variants yet", {
          description: "Add colors/sizes and build the variant matrix before saving.",
        })
        return
      }

      const hasValidPrice = variantRows.some((row) => {
        const price = Number(row.price)
        return Number.isFinite(price) && price > 0
      })
      if (!hasValidPrice) {
        toast.error("Invalid price", {
          description: "At least one variant must have a price greater than 0.",
        })
        return
      }

      const resolvedOptions = resolveProductOptionsFromRows(productOptions, variantRows).filter(
        (opt) => opt.title && opt.values.length > 0
      )
      if (!resolvedOptions.length) {
        toast.error("Missing options", {
          description: "Add option names and values (e.g. Color, Size), then save.",
        })
        return
      }

      const optionTitles = resolvedOptions.map((opt) => opt.title)
      const comboKeys = new Set<string>()
      for (const variant of variantRows) {
        for (const title of optionTitles) {
          if (!variant.optionValues[title]?.trim()) {
            toast.error("Incomplete variant row", {
              description: `Every row needs a value for "${title}"`,
            })
            return
          }
        }
        const combo = variantComboKey(optionTitles, variant.optionValues)
        if (comboKeys.has(combo)) {
          toast.error("Duplicate combination", {
            description: `"${combo.replace(/\|/g, ", ")}" appears more than once`,
          })
          return
        }
        comboKeys.add(combo)
      }
    }

    setSaving(true)

    try {
      const matrixChanged =
        hasVariants &&
        (variantRowsChanged ||
          productOptionsChanged ||
          colorImagesChanged ||
          hasVariantsChanged)

      if (matrixChanged) {
        const skuValidation = validateProductSkus(
          variantRows.map((row) => row.sku),
          usedSkus
        )
        if (!skuValidation.ok) {
          toast.error(skuValidation.title, { description: skuValidation.description })
          setSaving(false)
          return
        }

        const resolvedOptions = resolveProductOptionsFromRows(productOptions, variantRows).filter(
          (opt) => opt.title && opt.values.length > 0
        )
        const serializedColorImages = serializeColorImages(colorImages)
        const allImageUrls = collectAllImageUrls([], colorImages)

        await vendorProductsApi.updateVariants(productId, {
          options: resolvedOptions,
          variants: variantRows.map((row) => ({
            id: row.id,
            title: row.title,
            sku: row.sku || null,
            manage_inventory: row.managedInventory,
            allow_backorder: row.allowBackorder,
            inventory_quantity: Math.max(
              0,
              Math.floor(Number.parseInt(row.inventoryCount, 10)) || 0
            ),
            price: row.price ? Number(row.price) : undefined,
            discounted_price: row.discountedPrice ? Number(row.discountedPrice) : undefined,
            options: row.optionValues,
            option_values: row.optionValues,
          })),
          color_images: serializedColorImages,
          primary_visual_option: primaryVisualOption || undefined,
          images: allImageUrls.map((url) => ({ url })),
          vendor_edit_remark: formData.vendorRemark.trim(),
        })

        setInitialVariantRows(variantRows)
        setInitialProductOptions(productOptions)
        setInitialColorImages(colorImages)
        setInitialHasVariants(true)
      }

      const nonPriceFields = changedFields.filter(
        (field) => field !== "price" && field !== "discounted_price"
      )
      const simplePriceChanged =
        !hasVariants &&
        (formData.price.trim() !== initialFormData.price.trim() ||
          formData.discountedPrice.trim() !== initialFormData.discountedPrice.trim() ||
          variantRowsChanged)

      if (nonPriceFields.length > 0 || simplePriceChanged) {
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

      const resetFormData = {
        ...formData,
        vendorRemark: "",
        price: hasVariants ? formData.price : String(parsedPrice),
        discountedPrice: hasVariants
          ? formData.discountedPrice
          : hasDiscountedValue
            ? String(parsedDiscountedPrice)
            : "",
      }
      setInitialFormData(resetFormData)
      setFormData(resetFormData)
      if (!hasVariants) {
        setInitialVariantRows(variantRows)
        setInitialHasVariants(false)
        setInitialProductOptions([])
      }

      // Reflect pending approval immediately in the UI badge
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              status: "draft",
              metadata: {
                ...(prev.metadata || {}),
                approval_status: "pending",
              },
            }
          : prev
      )

      toast.success("Sent for approval", {
        description: "Admin will review your changes shortly.",
      })
      setApprovalSentOpen(true)
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

              <div className="space-y-2 md:col-span-2 rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle/40 px-4 py-3">
                <Text className="text-sm text-ui-fg-subtle">
                  {hasVariants
                    ? "Variant prices and stock are edited in the Options section below (Color, Size, etc.)."
                    : 'Single-price product. Turn on "Multiple options?" below to add Color / Size variants.'}
                </Text>
              </div>

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

              <div className="space-y-3 md:col-span-2">
                <Label>Remark For Admin *</Label>
                <Textarea
                  value={formData.vendorRemark}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange("vendorRemark", e.target.value)}
                  rows={4}
                  placeholder="Example: Updated price from ₹899 to ₹999, changed title, moved to Electronics collection."
                  required
                />
                <div className="flex gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-semibold text-amber-700 dark:text-amber-300"
                    aria-hidden
                  >
                    i
                  </span>
                  <div className="min-w-0 space-y-1">
                    <Text weight="plus" className="text-sm text-amber-900 dark:text-amber-200">
                      Admin review note
                    </Text>
                    <Text className="text-sm leading-relaxed text-amber-800/90 dark:text-amber-100/80">
                      Admin will see this remark while verifying the product. Clearly describe what you
                      changed — for example price, title, or category — so approval is faster.
                    </Text>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-ui-border-base pt-5">
              <Heading level="h2" className="mb-3 text-base font-['Space_Grotesk',var(--font-geist-sans)]">
                Options & variants
              </Heading>
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
                usedSkus={usedSkus}
              />
            </div>

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
                  <Text className="text-ui-fg-subtle text-sm">
                    ₹{" "}
                    {hasVariants
                      ? variantRows.find((row) => Number(row.price) > 0)?.price || "--"
                      : variantRows[0]?.price || formData.price || "--"}
                  </Text>
                  {!hasVariants && (variantRows[0]?.discountedPrice || formData.discountedPrice) && (
                    <Text className="text-emerald-500 text-sm font-medium">
                      Sale ₹ {variantRows[0]?.discountedPrice || formData.discountedPrice}
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

  return (
    <VendorShell>
      {content}
      <FocusModal open={approvalSentOpen} onOpenChange={setApprovalSentOpen}>
        <FocusModal.Content className="z-[100]">
          <FocusModal.Header>
            <FocusModal.Title>Changes sent for approval</FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col items-center gap-4 px-6 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-oweg-500/15 text-2xl text-oweg-600">
              ✓
            </div>
            <div className="space-y-2">
              <Heading level="h2" className="text-xl">
                Product update submitted
              </Heading>
              <Text className="text-ui-fg-subtle">
                Your changes have been sent for admin approval. The product is now{" "}
                <span className="font-medium text-ui-fg-base">Pending</span> and will go live again
                after an admin reviews it.
              </Text>
              <Text className="text-sm text-ui-fg-muted">
                Admin kuch der mein approve karega — please wait for review.
              </Text>
            </div>
            <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="secondary" onClick={() => setApprovalSentOpen(false)}>
                Keep editing
              </Button>
              <Button
                onClick={() => {
                  setApprovalSentOpen(false)
                  router.push("/products")
                }}
              >
                Go to products
              </Button>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </VendorShell>
  )
}

export default VendorProductEditPage
