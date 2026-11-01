"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import PageSkeleton from "@/components/PageSkeleton"
import ProductImageDropzone from "@/components/ProductImageDropzone"
import { productImageSelectionError, uploadProductImageFiles } from "@/lib/product-image-upload"
import { variantPricesError } from "@/lib/variant-pricing"
import VariantMatrixEditor from "@/components/VariantMatrixEditor"
import { simpleProductPrices, serializeProductEditVariants } from "@/lib/product-edit"
import GstTaxCodeField from "@/components/GstTaxCodeField"
import CategorySubcategoryPicker, {
  buildCategoryPickerValue,
  type CategorySubcategoryValue,
} from "@/components/CategorySubcategoryPicker"
import type { ProductMetadata } from "@/lib/api/contracts"
import { ApiError, vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi, vendorInventoryApi } from "@/lib/api/client"
import {
  collectAllImageUrls,
  detectVisualOption,
  isSimpleDefaultProduct,
  resolveProductOptionsFromRows,
  serializeColorImages,
  UNSPECIFIED_SIZE,
  variantComboKey,
  type ProductOptionDef,
  type UploadedImageRef,
  type VariantMatrixRow,
} from "@/lib/variant-matrix"
import { buildUsedSkuSet, validateProductSkus } from "@/lib/sku-validation"
import {
  htmlToEditableDescription,
  toProductDescriptionHtml,
} from "@/lib/plain-description"
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
  metadata?: ProductMetadata | null
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
  parent_category_id?: string | null
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
  categoryRequest: string
  collectionId: string
  taxCode: string
  gstRate: string
  vendorRemark: string
}

const EMPTY_FORM: EditFormData = {
  title: "",
  description: "",
  handle: "",
  price: "",
  discountedPrice: "",
  categoryId: "",
  categoryRequest: "",
  collectionId: "",
  taxCode: "",
  gstRate: "",
  vendorRemark: "",
}

const EMPTY_CATEGORY_PICKER: CategorySubcategoryValue = {
  categoryId: "",
  categoryRequest: "",
  parentId: "",
  parentLabel: "",
  subLabel: "",
  requestedParentName: "",
}

const VendorProductEditPage = () => {
  const router = useRouter()
  const params = useParams()
  const productId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [atomicEditSupported, setAtomicEditSupported] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
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
  const [galleryImages, setGalleryImages] = useState<UploadedImageRef[]>([])
  const [initialGalleryImages, setInitialGalleryImages] = useState<UploadedImageRef[]>([])
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [initialThumbnailUrl, setInitialThumbnailUrl] = useState<string | null>(null)
  const imageUploadActive = useRef(false)
  const imageSection = useRef<HTMLDivElement>(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingVariantImages, setUploadingVariantImages] = useState(false)
  const [primaryVisualOption, setPrimaryVisualOption] = useState("")
  const [usedSkus, setUsedSkus] = useState<Set<string>>(new Set())

  const [categoryPicker, setCategoryPicker] =
    useState<CategorySubcategoryValue>(EMPTY_CATEGORY_PICKER)

  useEffect(() => {
    // Files dropped outside an upload target must not navigate away from unsaved edits.
    const preventFileNavigation = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return
      event.preventDefault()
      if (event.type === "drop") toast.error("Drop images inside the image upload area")
    }
    window.addEventListener("dragover", preventFileNavigation)
    window.addEventListener("drop", preventFileNavigation)
    return () => {
      window.removeEventListener("dragover", preventFileNavigation)
      window.removeEventListener("drop", preventFileNavigation)
    }
  }, [])

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
          vendorCategoriesApi.list({ limit: 500, offset: 0 }).catch(() => ({ product_categories: [] })),
          vendorCollectionsApi.list({ limit: 100, offset: 0 }).catch(() => ({ collections: [] })),
          vendorInventoryApi.list().catch(() => ({ success: false, inventory: [] })),
        ])

        const prod = productResponse.product
        const summary = productResponse.variant_summary as VariantSummary | null
        const matrix = productResponse.variant_matrix as {
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
        const loadedColorImages = (productResponse.color_images || {}) as Record<
          string,
          string[]
        >
        const loadedPrimaryVisual = productResponse.primary_visual_option as string | undefined

        if (!prod) {
          setLoading(false)
          return
        }

        const loadedCategories = categoriesResponse.product_categories || []
        const loadedCollections = collectionsResponse.collections || []

        setAtomicEditSupported(productResponse.atomic_edit_version === 1)
        setProduct(prod)
        setVariantSummary(summary || null)
        setCategories(loadedCategories)
        setCollections(loadedCollections)
        if (inventoryResponse.success) {
          setUsedSkus(
            buildUsedSkuSet(inventoryResponse.inventory || [], productId)
          )
        }

        const existingCategoryId = String(
          prod?.categories?.[0]?.id ||
          (Array.isArray(prod?.metadata?.categories) ? prod.metadata.categories[0] : "") ||
          ""
        )
        const existingCollectionId = String(
          prod?.collection_id ||
          prod?.collection?.id ||
          prod?.metadata?.collection_id ||
          ""
        )
        const existingTaxCode = String(prod?.metadata?.tax_code || "")
        const existingGstRate =
          prod?.metadata?.gst_rate != null && prod?.metadata?.gst_rate !== ""
            ? String(prod.metadata.gst_rate)
            : ""

        const nextForm: EditFormData = {
          title: prod.title || "",
          description: htmlToEditableDescription(prod.description || ""),
          handle: prod.handle || "",
          price: summary?.price != null ? String(summary.price) : "",
          discountedPrice: summary?.discounted_price != null ? String(summary.discounted_price) : "",
          categoryId: existingCategoryId,
          categoryRequest: String(prod?.metadata?.category_request || ""),
          collectionId: existingCollectionId,
          taxCode: existingTaxCode,
          gstRate: existingGstRate,
          vendorRemark: "",
        }

        setCategoryPicker(
          buildCategoryPickerValue(
            loadedCategories,
            existingCategoryId,
            String(prod?.metadata?.category_request || "")
          )
        )

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
          optionValues: Object.fromEntries(Object.entries(variant.option_values || {}).map(([title, value]) => [title, /^size$/i.test(title) && value === UNSPECIFIED_SIZE ? "" : value])),
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
        const variantImageUrls = new Set(Object.values(loadedColorImages).flat())
        const existingUrls = Array.from(new Set([
          ...(prod.thumbnail ? [prod.thumbnail] : []),
          ...(prod.images || []).map((image) => image.url),
        ]))
        const gallery = existingUrls
          .filter((url) => !productHasVariants || !variantImageUrls.has(url))
          .map((url) => ({ url }))
        setGalleryImages(gallery)
        setInitialGalleryImages(gallery)
        setThumbnailUrl(prod.thumbnail || existingUrls[0] || null)
        setInitialThumbnailUrl(prod.thumbnail || existingUrls[0] || null)
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
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 403) {
          router.push("/pending")
          return
        }

        const message = e instanceof Error ? e.message : "Failed to load product details"
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
    if (formData.categoryRequest.trim() !== initialFormData.categoryRequest.trim()) {
      changes.push("category_request")
    }
    if (formData.collectionId !== initialFormData.collectionId) changes.push("collection")
    if (formData.taxCode !== initialFormData.taxCode) changes.push("tax_code")
    if (formData.gstRate !== initialFormData.gstRate) changes.push("gst_rate")

    if (JSON.stringify(galleryImages.map((image) => image.url)) !==
        JSON.stringify(initialGalleryImages.map((image) => image.url)) ||
        thumbnailUrl !== initialThumbnailUrl) changes.push("images")

    return changes
  }, [formData, initialFormData, galleryImages, initialGalleryImages, thumbnailUrl, initialThumbnailUrl])

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

  const allChangedFields = [
    ...changedFields,
    ...(variantRowsChanged ? [hasVariants ? "variant details" : "pricing & stock"] : []),
    ...(productOptionsChanged || hasVariantsChanged ? ["options"] : []),
    ...(colorImagesChanged ? ["variant images"] : []),
  ]
  const hasChanges = allChangedFields.length > 0

  const selectedCategoryName = useMemo(() => {
    return categories.find((c) => c.id === formData.categoryId)?.name || ""
  }, [categories, formData.categoryId])

  const selectedCollectionTitle = useMemo(() => {
    return collections.find((c) => c.id === formData.collectionId)?.title || ""
  }, [collections, formData.collectionId])

  const handleFieldChange = (field: keyof EditFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const allImageUrls = collectAllImageUrls(galleryImages, hasVariants ? colorImages : {})
  const previewImage = (thumbnailUrl && allImageUrls.includes(thumbnailUrl)
    ? thumbnailUrl : allImageUrls[0]) || null

  const handleImageUpload = async (files: File[]) => {
    if (!files.length || imageUploadActive.current || saving) return
    const validationError = productImageSelectionError(files)
    if (validationError) { toast.error(validationError); return }
    imageUploadActive.current = true
    setUploadingImages(true)
    try {
      const { uploaded, errors } = await uploadProductImageFiles(files, async file => {
        const data = await vendorProductsApi.uploadImage(file)
        const image = data.files?.[0] || data
        if (!image?.url) throw new Error("No image URL returned")
        return { url: image.url, originalName: file.name }
      })
      setGalleryImages(previous => [...previous, ...uploaded])
      if (errors.length) toast.error("Some images could not be uploaded", { description: errors[0] })
    } finally {
      imageUploadActive.current = false
      setUploadingImages(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (uploadingImages || uploadingVariantImages || saving) return
    if (!atomicEditSupported) {
      toast.error("Backend update required", { description: "Deploy the product editing backend before saving changes, then reload this page." })
      return
    }

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
    const { price: simplePriceSource, discountedPrice: simpleSaleSource } = simpleProductPrices(simpleRow, formData)

    const parsedPrice = Number(simplePriceSource)
    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Invalid MRP", { description: "Enter a valid MRP greater than 0." })
      return
    }
    const hasDiscountedValue = (simpleSaleSource || "").trim().length > 0
    const parsedDiscountedPrice = hasDiscountedValue ? Number(simpleSaleSource) : null
    if (!hasVariants && hasDiscountedValue && (!Number.isFinite(parsedDiscountedPrice) || (parsedDiscountedPrice as number) <= 0)) {
      toast.error("Invalid discounted price", { description: "Enter a valid discounted price greater than 0." })
      return
    }
    if (!hasVariants && hasDiscountedValue && (parsedDiscountedPrice as number) > parsedPrice) {
      toast.error("Invalid discounted price", {
        description: "Sale price cannot exceed MRP.",
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

      // Validate the edited rows, never the stale single-product price summary.
      const pricingError = variantPricesError(variantRows.map(row => ({
        ...row, discounted_price: row.discountedPrice,
      })))
      if (pricingError) {
        toast.error("Check variant pricing", { description: pricingError })
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
          if (!/^size$/i.test(title) && !variant.optionValues[title]?.trim()) {
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
      const existingSkus = new Set(initialVariantRows.map((row) => row.sku.trim().toUpperCase()).filter(Boolean))
      const skuValidation = validateProductSkus(variantRows.map((row) => row.sku), new Set([...usedSkus].filter((sku) => !existingSkus.has(sku))))
      if (!skuValidation.ok) {
        toast.error(skuValidation.title, { description: skuValidation.description })
        return
      }
      const resolvedOptions = hasVariants
        ? resolveProductOptionsFromRows(productOptions, variantRows).filter((opt) => opt.title && opt.values.length)
        : hasVariantsChanged ? [{ title: "Default", values: ["Default"] }] : undefined
      const variants = serializeProductEditVariants(variantRows, resolvedOptions, hasVariants)
      const data = await vendorProductsApi.update(productId, {
        title: formData.title.trim(),
        description: formData.description.trim() ? toProductDescriptionHtml(formData.description) : null,
        handle: formData.handle.trim() || null,
        category_ids: formData.categoryId ? [formData.categoryId] : [],
        collection_id: formData.collectionId || null,
        ...(resolvedOptions ? { options: resolvedOptions } : {}),
        variants,
        color_images: hasVariants ? serializeColorImages(colorImages) : {},
        primary_visual_option: hasVariants ? primaryVisualOption || undefined : undefined,
        images: allImageUrls.map((url) => ({ url })),
        thumbnail: previewImage,
        vendor_edit_remark: formData.vendorRemark.trim(),
        metadata: {
          category: selectedCategoryName || null,
          categories: formData.categoryId ? [formData.categoryId] : [],
          collection_id: formData.collectionId || null,
          collection_title: selectedCollectionTitle || null,
          tax_code: formData.taxCode || null,
          gst_rate: formData.gstRate !== "" ? Number(formData.gstRate) : null,
          last_vendor_changed_fields: allChangedFields,
          ...(formData.categoryRequest.trim()
            ? {
                category_request: formData.categoryRequest.trim(),
                category_request_status: "pending",
                category_request_submitted_at: new Date().toISOString(),
              }
            : {
                category_request: null,
                category_request_status: null,
                category_request_submitted_at: null,
              }),
        },
      })
      if (!data?.product || data.atomic_edit_version !== 1) throw new Error("Backend update required. Reload after deploying the product editing backend.")
      setProduct(data.product as Product)
      const savedRows = variantRows.map((row, index) => ({ ...row, id: data.variant_ids?.[index] || row.id }))
      setVariantRows(savedRows)
      // Baselines only advance after the server commits the entire edit.
      setInitialVariantRows(savedRows)
      setInitialProductOptions(productOptions)
      setInitialHasVariants(hasVariants)

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
      setInitialGalleryImages(galleryImages)
      setThumbnailUrl(previewImage)
      setInitialThumbnailUrl(previewImage)
      setInitialColorImages(colorImages)
      setInitialFormData(resetFormData)
      setFormData(resetFormData)
      setCategoryPicker(
        buildCategoryPickerValue(
          categories,
          resetFormData.categoryId,
          resetFormData.categoryRequest
        )
      )
      if (!hasVariants) {
        setInitialVariantRows(savedRows)
        setInitialHasVariants(false)
        setInitialProductOptions([])
        setProductOptions([])
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
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to update product" })
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
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to delete product" })
    } finally {
      setDeleting(false)
    }
  }

  const handleListingStatus = async (action: "draft" | "publish") => {
    if (!product) return

    const confirmMessage =
      action === "draft"
        ? "Draft this product? It will be hidden from the OWEG storefront until you publish it again."
        : "Publish this product? It will become visible on the OWEG storefront immediately (already admin-approved)."

    if (!confirm(confirmMessage)) return

    setStatusUpdating(true)
    try {
      const data = await vendorProductsApi.setStatus(productId, action)
      const next = data?.product
      if (next) {
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                status: next.status || prev.status,
                metadata: {
                  ...(prev.metadata || {}),
                  ...(next.metadata || {}),
                },
              }
            : prev
        )
      } else {
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                status: action === "publish" ? "published" : "draft",
                metadata: {
                  ...(prev.metadata || {}),
                  approval_status: prev.metadata?.approval_status || "approved",
                },
              }
            : prev
        )
      }

      toast.success(action === "draft" ? "Moved to draft" : "Published", {
        description:
          data?.message ||
          (action === "draft"
            ? "Product is now hidden from the storefront."
            : "Product is now visible on the storefront."),
      })
    } catch (e: unknown) {
      toast.error("Error", {
        description: e instanceof Error ? e.message : `Failed to ${action} product`,
      })
    } finally {
      setStatusUpdating(false)
    }
  }

  const previewVariant = variantRows.find(row => Number(row.price) > 0) || variantRows[0]

  let content

  if (loading) {
    content = <PageSkeleton label="Loading product editor…" />
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
        <div className="overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Text className="text-xs uppercase tracking-[0.18em] text-ui-fg-subtle font-['Space_Grotesk',var(--font-geist-sans)]">
                Vendor Product Review Flow
              </Text>
              <Heading level="h1" className="font-['Space_Grotesk',var(--font-geist-sans)]">
                Edit Product
              </Heading>
              <Text className="text-ui-fg-subtle">
                Save field changes with a remark to send for admin approval. Mark Unpublished / Publish to hide or show an already-approved product without re-approval.
              </Text>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge color={product.metadata?.approval_status === "pending" ? "orange" : product.status === "published" ? "green" : "grey"}>
                  {product.metadata?.approval_status === "approved" && product.status === "draft"
                    ? "draft (approved)"
                    : product.metadata?.approval_status || product.status}
                </Badge>
                <Button variant="danger" onClick={handleDelete} disabled={deleting || statusUpdating}>
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>

              <div className="w-full max-w-md rounded-xl border border-ui-border-base bg-ui-bg-base/70 p-3">
                <Text size="small" weight="plus" className="text-ui-fg-base">
                  Storefront listing
                </Text>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  {String(product.metadata?.approval_status || "").toLowerCase() === "pending"
                    ? "This product is pending admin approval, so it is not live yet. Draft / Publish unlock after approval."
                    : String(product.metadata?.approval_status || "").toLowerCase() !== "approved"
                      ? "Admin must approve this product once before you can publish it to the storefront."
                      : product.status === "published"
                        ? "Live on OWEG. Mark Unpublished to hide it without losing approval."
                        : "Hidden from OWEG. Publish to make it visible again (no re-approval needed)."}
                </Text>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleListingStatus("draft")}
                    disabled={
                      statusUpdating ||
                      saving ||
                      deleting ||
                      product.status !== "published"
                    }
                  >
                    {statusUpdating ? "Updating..." : "Mark Unpublished"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="oweg-btn-primary"
                    onClick={() => handleListingStatus("publish")}
                    disabled={
                      statusUpdating ||
                      saving ||
                      deleting ||
                      product.status === "published" ||
                      String(product.metadata?.approval_status || "").toLowerCase() !== "approved"
                    }
                  >
                    {statusUpdating ? "Updating..." : "Publish"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={handleSubmit} className="min-w-0 space-y-5 rounded-2xl border border-ui-border-base bg-ui-bg-component p-5 md:p-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3">
                <Text size="small">{hasVariants ? "Manage photos for each variant below." : "Add or update your product photos below."}</Text>
                <Button type="button" variant="secondary" size="small" onClick={() => {
                  imageSection.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  imageSection.current?.focus({ preventScroll: true })
                }}>Upload / edit images</Button>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Product name *</Label>
                <Input
                  value={formData.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange("title", e.target.value)}
                  required
                  placeholder="Enter product name"
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

              <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2 md:items-start">
                <CategorySubcategoryPicker
                  categories={categories}
                  value={categoryPicker}
                  onChange={(next) => {
                    setCategoryPicker(next)
                    setFormData((prev) => ({
                      ...prev,
                      categoryId: next.categoryId,
                      categoryRequest: next.categoryRequest,
                    }))
                  }}
                />
                <div className="space-y-2">
                  <Label>
                    Brand <span className="font-normal text-ui-fg-muted">(Optional)</span>
                  </Label>
                  <Text size="small" className="text-ui-fg-muted">
                    Select the brand for this product
                  </Text>
                  <div className="relative">
                    <select
                      value={formData.collectionId}
                      onChange={(e) => handleFieldChange("collectionId", e.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-ui-border-base bg-ui-bg-base py-2 pl-3 pr-9 text-sm text-ui-fg-base outline-none transition focus:border-ui-fg-interactive"
                    >
                      <option value="">Select brand</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ui-fg-muted">
                      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <GstTaxCodeField
                  value={formData.taxCode}
                  suggestFrom={formData.title}
                  required={false}
                  onChange={(code, rate) =>
                    setFormData((prev) => ({
                      ...prev,
                      taxCode: code,
                      gstRate: rate == null ? "" : String(rate),
                    }))
                  }
                />
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

            <div ref={imageSection} tabIndex={-1} id="product-images" className="scroll-mt-6 border-t border-ui-border-base pt-5">
              <Heading level="h2" className="mb-3 text-base font-['Space_Grotesk',var(--font-geist-sans)]">
                Product images & variants
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
                onImageUploadStateChange={setUploadingVariantImages}
                simpleProductExtras={
                  <div className="space-y-4">
                    <Text weight="plus">Product images</Text>
                    <Text size="small" className="text-ui-fg-subtle">Upload photos, remove old images, or choose the thumbnail shown in your listing.</Text>
                    <ProductImageDropzone onFiles={files => { void handleImageUpload(files) }} uploading={uploadingImages} disabled={saving} />
                    <div className="flex flex-wrap gap-4">
                      {galleryImages.map((image, index) => (
                        <div key={`${image.url}-${index}`} className="space-y-2 rounded-lg border border-ui-border-base p-2">
                          <img src={image.url} alt={image.originalName || `Product image ${index + 1}`} className="h-24 w-24 object-contain" />
                          <div className="flex flex-col gap-2">
                            <Button type="button" size="small" variant="secondary" disabled={saving || uploadingImages} onClick={() => setThumbnailUrl(image.url)}>
                              {previewImage === image.url ? "Thumbnail" : "Set thumbnail"}
                            </Button>
                            <Button type="button" size="small" variant="secondary" disabled={saving || uploadingImages} onClick={() => setGalleryImages((previous) => previous.filter((_, i) => i !== index))}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                }
                usedSkus={usedSkus}
              />
            </div>

            {!atomicEditSupported && <Text className="text-sm text-ui-fg-error">Deploy the updated product editing backend, then reload this page to enable saving.</Text>}
            <div className="flex flex-col gap-3 border-t border-ui-border-base pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={hasChanges ? "orange" : "grey"}>
                  {hasChanges ? `${allChangedFields.length} field(s) changed` : "No pending changes"}
                </Badge>
                {allChangedFields.map((field) => (
                  <Badge key={field} color="blue">
                    {field}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => router.push("/products")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || uploadingImages || uploadingVariantImages || !hasChanges || !atomicEditSupported}>
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
                  {previewImage ? (
                    <img
                      src={previewImage}
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
                    MRP ₹ {previewVariant?.price || formData.price || "--"}
                  </Text>
                  {(previewVariant?.discountedPrice || (!hasVariants && formData.discountedPrice)) && (
                    <Text className="text-emerald-500 text-sm font-medium">
                      Sale ₹ {previewVariant?.discountedPrice || formData.discountedPrice}
                    </Text>
                  )}
                </div>
                {hasVariants && previewVariant?.title && <Text className="text-xs text-ui-fg-subtle">{previewVariant.title}</Text>}
                {(previewVariant?.sku || variantSummary?.sku) && (
                  <Text className="text-xs text-ui-fg-subtle">SKU: {previewVariant?.sku || variantSummary?.sku}</Text>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-component p-5">
              <Heading level="h2" className="mb-3 text-base font-['Space_Grotesk',var(--font-geist-sans)]">
                Listing & Approval
              </Heading>
              <div className="space-y-2 text-sm text-ui-fg-subtle">
                <Text>1. Edit fields + remark → pending admin approval.</Text>
                <Text>2. Admin approves → product goes live on OWEG.</Text>
                <Text>3. Mark Unpublished anytime to hide it (low stock, pause listing).</Text>
                <Text>4. Publish again later — no re-approval if it was already approved.</Text>
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
