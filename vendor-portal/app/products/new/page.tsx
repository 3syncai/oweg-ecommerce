"use client"

import React, { useState, useEffect } from "react"
import { Heading, Text, Button, Input, Textarea, Label, Switch, toast, clx } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { useRouter } from "next/navigation"
import { BrandAuthorizationField } from "@/components/BrandAuthorizationField"
import GstTaxCodeField from "@/components/GstTaxCodeField"
import VariantMatrixEditor from "@/components/VariantMatrixEditor"
import ReturnReplacementPolicyFields, {
  EMPTY_RETURN_REPLACEMENT_POLICY,
  type ReturnReplacementPolicy,
} from "@/components/ReturnReplacementPolicyFields"
import { apiRequest, vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi, vendorTypesApi, vendorInventoryApi, vendorShippingApi, logApiFailure } from "@/lib/api/client"
import { DEFAULT_LOGISTICS_FEE } from "@/lib/pricingConfig"
import {
  collectAllImageUrls,
  createDefaultVariantRow,
  detectVisualOption,
  resolveProductOptionsFromRows,
  serializeColorImages,
  variantComboKey,
  type ProductOptionDef,
  type UploadedImageRef,
  type VariantMatrixRow,
} from "@/lib/variant-matrix"
import { buildUsedSkuSet, validateProductSkus } from "@/lib/sku-validation"
import { stripDescriptionSectionHeadings, toProductDescriptionHtml } from "@/lib/plain-description"
import axios from "axios"
import Image from "next/image"

type UploadedImage = {
  url: string
  key: string
  filename: string
  originalName: string
  isThumbnail?: boolean
}

type UploadedVideo = {
  url: string
  key: string
  filename: string
  originalName: string
}

type ProductFormData = {
  // Details
  title: string
  subtitle: string
  handle: string
  description: string
  media: File[]
  uploadedImages: UploadedImage[]
  uploadedVideos: UploadedVideo[]
  thumbnailUrl: string | null
  hasVariants: boolean

  // Attributes
  height: string
  width: string
  length: string
  weight: string
  midCode: string
  hsCode: string
  taxCode: string
  gstRate: string
  countryOfOrigin: string
  brand: string

  // Organize
  discountable: boolean
  type: string
  collection: string
  categories: string[]
  categoryRequest: string
  collectionRequest: string
  tags: string[]
  shippingProfile: string
  salesChannels: string[]

  // Options & variants
  productOptions: ProductOptionDef[]
  variants: VariantMatrixRow[]
  colorImages: Record<string, UploadedImageRef[]>
  primaryVisualOption: string
  returnReplacementPolicy: ReturnReplacementPolicy
}

const VendorProductNewPage = () => {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [sharedProduct, setSharedProduct] = useState<{ id: string; token: string } | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState("")
  const [categories, setCategories] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [productTypes, setProductTypes] = useState<any[]>([])

  // Category combobox state
  const [selectedParentCatId, setSelectedParentCatId] = useState<string>("")
  const [parentCatInput, setParentCatInput] = useState<string>("")
  const [showParentDrop, setShowParentDrop] = useState(false)
  const [subCatInput, setSubCatInput] = useState<string>("")
  const [showSubDrop, setShowSubDrop] = useState(false)
  // When vendor types a brand-new parent that doesn't exist yet, we store it
  // here so the subcategory row still appears for a "Parent > Sub" request
  const [requestedParentName, setRequestedParentName] = useState<string>("")
  // Collection combobox state
  const [collectionInput, setCollectionInput] = useState<string>("")
  const [showCollectionDrop, setShowCollectionDrop] = useState(false)
  const [tagDraft, setTagDraft] = useState("")

  // Title-case helper
  const toTitleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

  const [formData, setFormData] = useState<ProductFormData>({
    title: "",
    subtitle: "",
    handle: "",
    description: "",
    media: [],
    uploadedImages: [],
    uploadedVideos: [],
    thumbnailUrl: null,
    hasVariants: false,
    height: "",
    width: "",
    length: "",
    weight: "",
    midCode: "",
    hsCode: "",
    taxCode: "",
    gstRate: "",
    countryOfOrigin: "",
    brand: "",
    discountable: true,
    type: "",
    collection: "",
    categories: [],
    categoryRequest: "",
    collectionRequest: "",
    tags: [],
    shippingProfile: "",
    salesChannels: ["Default Sales Channel"],
    productOptions: [],
    variants: [createDefaultVariantRow()],
    colorImages: {},
    primaryVisualOption: "",
    returnReplacementPolicy: EMPTY_RETURN_REPLACEMENT_POLICY,
  })

  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingVideos, setUploadingVideos] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [brandIsAuthorized, setBrandIsAuthorized] = useState(false)
  const [brandNeedsAuthorization, setBrandNeedsAuthorization] = useState(false)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [brandAuthorizationFile, setBrandAuthorizationFile] = useState<File | null>(null)
  const [usedSkus, setUsedSkus] = useState<Set<string>>(new Set())
  const [migrateUrl, setMigrateUrl] = useState("")
  const [migrating, setMigrating] = useState(false)
  const [migrateWarnings, setMigrateWarnings] = useState<string[]>([])
  const [migrateReady, setMigrateReady] = useState(false)
  const [migrateSourceMeta, setMigrateSourceMeta] = useState<{
    source_url?: string
    source?: string
  } | null>(null)
  const [logisticsEstimate, setLogisticsEstimate] = useState<{
    freight_charge: number
    gst_rate: number
    gst_amount: number
    total_logistics_fee: number
    courier_name: string
    pickup_pincode?: string
    delivery_pincode?: string
    applied_weight?: number
    provider?: string
  } | null>(null)
  const [isFetchingLogistics, setIsFetchingLogistics] = useState(false)
  const menuRefs = React.useRef<{ [key: number]: HTMLDivElement | null }>({})

  const [availableDraft, setAvailableDraft] = useState<{
    formData: ProductFormData
    logisticsEstimate?: any
    savedAt: string
  } | null>(null)
  const [draftPromptOpen, setDraftPromptOpen] = useState(false)

  // Check for saved product draft on mount
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("shared_product")) return
    try {
      const raw = localStorage.getItem("vendor_product_new_draft")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.formData?.title?.trim()) {
          setAvailableDraft(parsed)
          setDraftPromptOpen(true)
        }
      }
    } catch (err) {
      console.warn("Failed to read product draft:", err)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("shared_product"), token = params.get("share")
    if (!id) return
    if (!token) { setShareError("The share link is incomplete. Ask the admin for a new link."); return }
    if (!localStorage.getItem("vendor_token")) {
      document.cookie = "vendor_token=; path=/; max-age=0; SameSite=Lax"
      router.replace(`/login?${new URLSearchParams({ redirect: window.location.pathname + window.location.search })}`)
      return
    }
    let cancelled = false
    setShareLoading(true)
    apiRequest<{ product: any }>(`/vendor/catalog/${encodeURIComponent(id)}?${new URLSearchParams({ share: token })}`)
      .then(({ product: p }) => {
        if (cancelled) return
        const m = p.metadata || {}
        setSharedProduct({ id, token })
        setFormData(prev => ({ ...prev,
          title: p.title || "", subtitle: p.subtitle || "", description: stripDescriptionSectionHeadings(p.description || ""),
          brand: m.brand || "UNBRANDED", handle: "", thumbnailUrl: p.thumbnail || null,
          uploadedImages: (p.images || []).map((image: any) => ({ url: image.url, key: "", filename: "", originalName: "Catalog image" })),
          uploadedVideos: (m.videos || []).map((video: any) => ({ url: typeof video === "string" ? video : video.url, key: "", filename: "", originalName: "Catalog video" })),
          height: String(p.height || ""), width: String(p.width || ""), length: String(p.length || ""), weight: String(p.weight || ""),
          midCode: m.mid_code || "", hsCode: m.hs_code || "", taxCode: m.tax_code || "", gstRate: String(m.gst_rate ?? ""), countryOfOrigin: m.country_of_origin || "",
          collection: p.collection_id || "", categories: (p.categories || []).map((category: any) => category.id), tags: (p.tags || []).map((tag: any) => tag.value),
          hasVariants: (p.variants || []).length > 1 || (p.options || []).some((option: any) => !(["default", "default option"].includes(String(option.title).toLowerCase()) && option.values?.length === 1 && option.values[0] === "Default")),
          productOptions: (p.options || []).map((option: any) => ({ ...option, valuesInput: option.values.join(", ") })),
          variants: (p.variants || []).map((variant: any) => ({ ...createDefaultVariantRow(), title: variant.title || "Default variant", sku: variant.sku || "", optionValues: variant.options || {}, price: "", discountedPrice: "", inventoryCount: "", allowBackorder: false })),
          colorImages: Object.fromEntries(Object.entries(m.color_images || {}).map(([key, urls]) => [key, (urls as string[]).map(url => ({ url }))])),
          primaryVisualOption: m.primary_visual_option || "",
          returnReplacementPolicy: { returnWindowDays: String(m.return_window_days ?? ""), replacementWindowDays: String(m.replacement_window_days ?? ""), useSameWindow: m.return_window_days === m.replacement_window_days },
        }))
        toast.success("Shared product loaded", { description: "Add your own price and stock. Brand authorization and admin review still apply." })
      }).catch((error: any) => {
        if (cancelled) return
        if (error.status === 401) {
          localStorage.removeItem("vendor_token")
          document.cookie = "vendor_token=; path=/; max-age=0; SameSite=Lax"
          router.replace(`/login?${new URLSearchParams({ redirect: window.location.pathname + window.location.search })}`)
        } else setShareError(error.message || "Could not load shared product")
      }).finally(() => { if (!cancelled) setShareLoading(false) })
    return () => { cancelled = true }
  }, [router])

  const handleSaveDraft = () => {
    const title = formData.title?.trim()
    if (!title) {
      toast.error("Product name required", {
        description: "Please enter a product name before saving as draft.",
      })
      return
    }

    try {
      const draftData = {
        formData,
        logisticsEstimate,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem("vendor_product_new_draft", JSON.stringify(draftData))
      setAvailableDraft(draftData)
      toast.success("Saved in draft", {
        description: `"${title}" has been saved as draft. You can publish it anytime.`,
      })
    } catch (err) {
      console.error("Failed to save draft:", err)
      toast.error("Failed to save draft")
    }
  }

  const handleLoadDraft = () => {
    if (!availableDraft?.formData) return
    setFormData({
      ...availableDraft.formData,
      returnReplacementPolicy:
        availableDraft.formData.returnReplacementPolicy || EMPTY_RETURN_REPLACEMENT_POLICY,
    })
    if (availableDraft.logisticsEstimate) {
      setLogisticsEstimate(availableDraft.logisticsEstimate)
    }
    setDraftPromptOpen(false)
    toast.success("Draft loaded", {
      description: `Loaded "${availableDraft.formData.title}". You can now review and publish it.`,
    })
  }

  const handleDiscardDraft = () => {
    localStorage.removeItem("vendor_product_new_draft")
    setAvailableDraft(null)
    setDraftPromptOpen(false)
    toast.info("Draft discarded")
  }

  // Automatically fetch ITL delivery charges when dimensions / weight are entered
  useEffect(() => {
    const h = parseFloat(formData.height)
    const w = parseFloat(formData.width)
    const l = parseFloat(formData.length)
    const wt = parseFloat(formData.weight)

    const hasDimensions = (!isNaN(h) && h > 0) || (!isNaN(w) && w > 0) || (!isNaN(l) && l > 0)
    const hasWeight = !isNaN(wt) && wt > 0

    if (!hasDimensions && !hasWeight) {
      return
    }

    const timer = setTimeout(async () => {
      setIsFetchingLogistics(true)
      try {
        const res = await vendorShippingApi.estimateRate({
          height: !isNaN(h) && h > 0 ? h : undefined,
          width: !isNaN(w) && w > 0 ? w : undefined,
          length: !isNaN(l) && l > 0 ? l : undefined,
          weight: !isNaN(wt) && wt > 0 ? wt : undefined,
        })
        if (res && res.success) {
          setLogisticsEstimate(res)
        }
      } catch (err) {
        logApiFailure("Failed to auto-fetch ITL shipping rate", err)
      } finally {
        setIsFetchingLogistics(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [formData.height, formData.width, formData.length, formData.weight])

  useEffect(() => {
    fetchCategoriesAndCollections()
    void loadUsedSkus()
  }, [])

  const loadUsedSkus = async () => {
    try {
      const token = localStorage.getItem("vendor_token")
      if (!token) return

      const data = await vendorInventoryApi.list()
      if (data.success) {
        setUsedSkus(buildUsedSkuSet(data.inventory || []))
      }
    } catch (error) {
      logApiFailure("Failed to load existing SKUs", error)
    }
  }

  const fetchCategoriesAndCollections = async () => {
    try {
      const token = localStorage.getItem("vendor_token")
      if (!token) return

      const [categoriesResult, collectionsResult, typesResult] = await Promise.allSettled([
        vendorCategoriesApi.list({ limit: 100 }),
        vendorCollectionsApi.list({ limit: 100 }),
        vendorTypesApi.list({ limit: 200 }),
      ])

      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value.product_categories || [])
      } else {
        logApiFailure("Failed to fetch categories", categoriesResult.reason)
      }
      if (collectionsResult.status === "fulfilled") {
        setCollections(collectionsResult.value.collections || [])
      } else {
        logApiFailure("Failed to fetch collections", collectionsResult.reason)
      }
      if (typesResult.status === "fulfilled") {
        setProductTypes(typesResult.value.product_types || [])
      } else {
        logApiFailure("Failed to fetch types", typesResult.reason)
      }
    } catch (error) {
      logApiFailure("Failed to fetch organize data", error)
    }
  }

  const handleMigrateFromOweg = async () => {
    const url = migrateUrl.trim()
    if (!url) {
      toast.error("Error", { description: "Paste an oweg.in product URL first" })
      return
    }

    setMigrating(true)
    setMigrateWarnings([])
    setMigrateReady(false)

    try {
      const result = await vendorProductsApi.migrateFromUrl(url)
      const draft = result.draft
      const uploadedImages: UploadedImage[] = (draft.uploadedImages || []).map((image) => ({
        url: image.url,
        key: image.key,
        filename: image.filename,
        originalName: image.originalName,
        isThumbnail: image.url === draft.thumbnailUrl,
      }))

      const variants: VariantMatrixRow[] = (draft.variants?.length
        ? draft.variants
        : [createDefaultVariantRow()]
      ).map((row) => ({
        title: row.title || "Default variant",
        sku: row.sku || draft.sku || "",
        managedInventory: row.managedInventory ?? true,
        allowBackorder: row.allowBackorder ?? true,
        inventoryCount: row.inventoryCount || "",
        price: row.price || draft.price || "",
        discountedPrice: row.discountedPrice || draft.discounted_price || "",
        optionValues: row.optionValues || {},
      }))

      const productOptions: ProductOptionDef[] = (draft.productOptions || []).map((opt) => ({
        title: opt.title,
        values: opt.values || [],
        valuesInput: opt.valuesInput || (opt.values || []).join(", "),
      }))

      const hasVariants = Boolean(draft.hasVariants)
      const primaryVisualOption =
        detectVisualOption(productOptions.map((o) => o.title).filter(Boolean)) || ""

      const colorImages: Record<string, UploadedImageRef[]> = {}
      for (const [colorValue, images] of Object.entries(draft.colorImages || {})) {
        colorImages[colorValue] = (images || []).map((image) => ({
          url: image.url,
          key: image.key,
          filename: image.filename,
          originalName: image.originalName,
        }))
      }

      const colorImageCount = Object.values(colorImages).reduce(
        (sum, imgs) => sum + imgs.length,
        0
      )
      const nextWarnings = [...(result.warnings || [])]
      if (hasVariants && !colorImageCount && !uploadedImages.length) {
        nextWarnings.push("No images were returned from oweg.in / S3 upload")
      } else if (hasVariants && !colorImageCount && uploadedImages.length) {
        nextWarnings.push(
          "Gallery images were fetched but could not be mapped to individual colors — add Photos by color manually"
        )
      }

      setFormData((prev) => ({
        ...prev,
        title: draft.title || prev.title,
        handle: draft.handle || prev.handle,
        description: stripDescriptionSectionHeadings(draft.description || prev.description),
        brand: draft.brand || prev.brand,
        hasVariants,
        productOptions,
        variants,
        uploadedImages: hasVariants ? [] : uploadedImages,
        colorImages: hasVariants ? colorImages : {},
        primaryVisualOption: hasVariants ? primaryVisualOption : "",
        thumbnailUrl:
          draft.thumbnailUrl ||
          Object.values(colorImages).flat()[0]?.url ||
          uploadedImages[0]?.url ||
          null,
      }))

      setMigrateSourceMeta(draft.metadata || null)
      setMigrateWarnings(nextWarnings)
      setMigrateReady(true)
      toast.success("Product fetched", {
        description: colorImageCount
          ? `Loaded ${colorImageCount} color photo(s). Review Photos by color, then Save now.`
          : "Review the form, then click Save now or Publish.",
      })
    } catch (e: unknown) {
      const err = e as { message?: string; data?: { message?: string } }
      toast.error("Migrate failed", {
        description: err?.data?.message || err?.message || "Could not import product from URL",
      })
    } finally {
      setMigrating(false)
    }
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      await uploadMediaToS3(files)
    }
  }

  const _handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // This is now handled by handleMediaUpload, but keeping for backward compatibility
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      await uploadMediaToS3(files)
    }
  }

  // Unified media upload handler that detects file type and routes appropriately
  const uploadMediaToS3 = async (files: File[]) => {
    if (files.length === 0) return

    setUploadingMedia(true)

    try {
      // Separate images and videos
      const imageFiles: File[] = []
      const videoFiles: File[] = []

      files.forEach((file) => {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file)
        } else if (file.type.startsWith('video/')) {
          videoFiles.push(file)
        } else {
          toast.error("Error", { description: `Unsupported file type: ${file.name}` })
        }
      })

      // Upload images and videos in parallel
      const uploadPromises: Promise<void>[] = []

      if (imageFiles.length > 0) {
        uploadPromises.push(uploadImagesToS3(imageFiles))
      }

      if (videoFiles.length > 0) {
        uploadPromises.push(uploadVideosToS3(videoFiles))
      }

      await Promise.all(uploadPromises)
    } finally {
      setUploadingMedia(false)
    }
  }

  const uploadImagesToS3 = async (files: File[]) => {
    if (files.length === 0) return

    setUploadingImages(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
      if (!token) {
        toast.error("Error", { description: "Not authenticated" })
        return
      }

      const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'

      // Get collection name if available
      const collectionName = formData.collection && collections.length > 0
        ? collections.find(c => c.id === formData.collection)?.title || ''
        : ''

      // Create FormData with metadata first (so fields are processed before files)
      const formDataToSend = new FormData()
      // Add fields first so Busboy processes them before files
      formDataToSend.append("productName", formData.title || "temp")
      if (collectionName) {
        formDataToSend.append("collectionName", collectionName)
      }
      // Then add files
      files.forEach((file) => {
        formDataToSend.append("files", file)
      })

      const uploadRes = await axios.post(`${API_URL}/vendor/products/upload-image`, formDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const uploadData = uploadRes.data
      const newImages: UploadedImage[] = uploadData.files?.map((f: any) => ({
        url: f.url,
        key: f.key,
        filename: f.filename,
        originalName: f.originalName,
        isThumbnail: false,
      })) || []

      setFormData(prev => ({
        ...prev,
        uploadedImages: [...prev.uploadedImages, ...newImages],
        thumbnailUrl: prev.uploadedImages.length === 0 && newImages.length > 0 ? newImages[0].url : prev.thumbnailUrl,
      }))

      toast.success("Success", { description: `${newImages.length} image(s) uploaded` })
    } catch (error: any) {
      console.error("Upload error:", error)
      toast.error("Error", { description: error?.message || "Failed to upload images" })
    } finally {
      setUploadingImages(false)
    }
  }

  const uploadVideosToS3 = async (files: File[]) => {
    if (files.length === 0) return

    setUploadingVideos(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
      if (!token) {
        toast.error("Error", { description: "Not authenticated" })
        return
      }

      const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'

      // Get collection name if available
      const collectionName = formData.collection && collections.length > 0
        ? collections.find(c => c.id === formData.collection)?.title || ''
        : ''

      // Create FormData with metadata first (so fields are processed before files)
      const formDataToSend = new FormData()
      // Add fields first so Busboy processes them before files
      formDataToSend.append("productName", formData.title || "temp")
      if (collectionName) {
        formDataToSend.append("collectionName", collectionName)
      }
      // Then add files
      files.forEach((file) => {
        formDataToSend.append("files", file)
      })

      const uploadRes = await axios.post(`${API_URL}/vendor/products/upload-video`, formDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const uploadData = uploadRes.data
      const newVideos: UploadedVideo[] = uploadData.files?.map((f: any) => ({
        url: f.url,
        key: f.key,
        filename: f.filename,
        originalName: f.originalName,
      })) || []

      setFormData(prev => ({
        ...prev,
        uploadedVideos: [...prev.uploadedVideos, ...newVideos],
      }))

      toast.success("Success", { description: `${newVideos.length} video(s) uploaded` })
    } catch (error: any) {
      console.error("Upload error:", error)
      toast.error("Error", { description: error?.message || "Failed to upload videos" })
    } finally {
      setUploadingVideos(false)
    }
  }

  const handleMakeThumbnail = (index: number) => {
    const image = formData.uploadedImages[index]
    setFormData({
      ...formData,
      thumbnailUrl: image.url,
      uploadedImages: formData.uploadedImages.map((img, idx) => ({
        ...img,
        isThumbnail: idx === index,
      })),
    })
    setOpenMenuIndex(null)
    toast.success("Success", { description: "Thumbnail set" })
  }

  const handleDeleteImage = (index: number) => {
    const imageToDelete = formData.uploadedImages[index]
    const newImages = formData.uploadedImages.filter((_, idx) => idx !== index)
    const newThumbnailUrl = imageToDelete.url === formData.thumbnailUrl
      ? (newImages.length > 0 ? newImages[0].url : null)
      : formData.thumbnailUrl

    setFormData({
      ...formData,
      uploadedImages: newImages,
      thumbnailUrl: newThumbnailUrl,
    })
    setOpenMenuIndex(null)
    toast.success("Success", { description: "Image removed" })
  }

  const handleDeleteVideo = (index: number) => {
    const newVideos = formData.uploadedVideos.filter((_, idx) => idx !== index)
    setFormData({
      ...formData,
      uploadedVideos: newVideos,
    })
    toast.success("Success", { description: "Video removed" })
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuIndex !== null) {
        const menuElement = menuRefs.current[openMenuIndex]
        if (menuElement && !menuElement.contains(event.target as Node)) {
          setOpenMenuIndex(null)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [openMenuIndex])

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      await uploadMediaToS3(files)
    }
  }

  const _handleVideoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    // This is now handled by handleDrop, but keeping for backward compatibility
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      await uploadMediaToS3(files)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleSubmit = async () => {
    if (shareLoading || shareError) { toast.error("Shared product is not ready", { description: shareError || "Wait for the product to load." }); return }
    // Final brand-gate so users can't bypass via direct Publish click after
    // editing form state.
    if (!formData.title) {
      toast.error("Error", { description: "Product name is required" })
      return
    }
    if (!formData.brand || !formData.brand.trim()) {
      toast.error("Error", { description: "Brand is required" })
      return
    }
    if (!brandIsAuthorized) {
      toast.error("Error", {
        description: brandNeedsAuthorization
          ? "Please upload the brand authorization letter before publishing"
          : "Please verify the brand before publishing",
      })
      return
    }

    if (!formData.taxCode?.trim()) {
      toast.error("Error", { description: "Tax Code (GST) is required" })
      return
    }

    const policy = formData.returnReplacementPolicy
    const parsePolicyDays = (value: string, label: string) => {
      if (!value.trim()) return null
      const days = Number(value)
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        toast.error("Invalid policy period", {
          description: `${label} must be a whole number between 0 and 365 days.`,
        })
        return undefined
      }
      return days
    }
    const returnWindowDays = parsePolicyDays(policy.returnWindowDays, "Return window")
    if (returnWindowDays === undefined) return
    const replacementWindowDays = policy.useSameWindow
      ? returnWindowDays
      : parsePolicyDays(policy.replacementWindowDays, "Replacement window")
    if (replacementWindowDays === undefined) return

    const hasValidPrice = formData.variants.some((v) => {
      const price = parseFloat(v.price)
      return Number.isFinite(price) && price > 0
    })
    if (!hasValidPrice) {
      toast.error("Error", { description: "At least one variant must have a price greater than 0" })
      return
    }

    if (formData.hasVariants) {
      if (!formData.variants.length) {
        toast.error("No variants yet", {
          description: "Define options and click Generate variant matrix",
        })
        return
      }

      const resolvedOptions = resolveProductOptionsFromRows(
        formData.productOptions,
        formData.variants
      ).filter((opt) => opt.title && opt.values.length > 0)

      if (!resolvedOptions.length) {
        toast.error("Missing options", { description: "Add option names and values, then generate the matrix" })
        return
      }

      const optionTitles = resolvedOptions.map((opt) => opt.title)
      const comboKeys = new Set<string>()
      for (const variant of formData.variants) {
        for (const title of optionTitles) {
          if (!variant.optionValues[title]?.trim()) {
            toast.error("Incomplete variant row", {
              description: `Every row needs a value for "${title}"`,
            })
            return
          }
        }
        const comboKey = variantComboKey(optionTitles, variant.optionValues)
        if (comboKeys.has(comboKey)) {
          toast.error("Duplicate combination", {
            description: `"${comboKey.replace(/\|/g, ", ")}" appears more than once`,
          })
          return
        }
        comboKeys.add(comboKey)
      }

    }

    const skus = formData.variants.map((v) => v.sku.trim()).filter(Boolean)
    const skuValidation = validateProductSkus(skus, usedSkus)
    if (!skuValidation.ok) {
      toast.error(skuValidation.title, { description: skuValidation.description })
      return
    }

    setLoading(true)

    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      toast.error("Error", { description: "Not authenticated" })
      router.push("/login")
      return
    }

    try {
      // 1. Upload Brand Authorization if pending
      if (brandAuthorizationFile && formData.brand) {
        try {
          const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
          const authFormData = new FormData()
          authFormData.append("brand_name", formData.brand)
          authFormData.append("file", brandAuthorizationFile)

          await axios.post(
            `${API_URL}/vendor/brands/upload-authorization`,
            authFormData,
            {
              headers: {
                Authorization: `Bearer ${vendorToken}`,
                "Content-Type": "multipart/form-data"
              }
            }
          )
          toast.success("Success", { description: "Brand authorization uploaded" })
          setBrandAuthorizationFile(null) // Prevent re-upload on retry
        } catch (authError: any) {
          console.error("Auth upload error:", authError)
          toast.error("Error", { description: "Failed to upload brand authorization. Please try again." })
          setLoading(false)
          return
        }
      }

      const allImageUrls = collectAllImageUrls(formData.uploadedImages, formData.colorImages)
      const serializedColorImages = serializeColorImages(formData.colorImages)
      const primaryVisualOption =
        formData.primaryVisualOption ||
        detectVisualOption(formData.productOptions.map((o) => o.title).filter(Boolean))

      const variants = formData.variants.map((v) => ({
        title: formData.hasVariants
          ? Object.values(v.optionValues).join(" / ") || v.title.trim() || "Variant"
          : v.title || "Default variant",
        sku: v.sku || undefined,
        manage_inventory: v.managedInventory,
        allow_backorder: v.allowBackorder,
        prices: v.price
          ? [
              { amount: parseFloat(v.price), currency_code: "inr" },
              ...(v.discountedPrice
                ? [
                    {
                      amount: parseFloat(v.discountedPrice),
                      currency_code: "inr",
                      price_list_id: "pl_1765232034558",
                    },
                  ]
                : []),
            ]
          : [],
        inventory_quantity: Math.max(0, Math.floor(Number.parseInt(v.inventoryCount, 10)) || 0),
        ...(formData.hasVariants ? { options: v.optionValues } : {}),
      }))

      const productOptions = formData.hasVariants
        ? resolveProductOptionsFromRows(formData.productOptions, formData.variants)
        : []

      const firstVisualImages =
        primaryVisualOption && serializedColorImages
          ? Object.values(serializedColorImages)[0]
          : undefined

      // Prepare attributes - convert strings to numbers where applicable
      const parseNumber = (value: string): number | null => {
        if (!value || value.trim() === "") return null
        const num = parseFloat(value)
        return isNaN(num) ? null : num
      }

      // Create product
      await vendorProductsApi.create({
        ...(sharedProduct ? { shared_product_id: sharedProduct.id, share_token: sharedProduct.token } : {}),
        title: formData.title,
        subtitle: formData.subtitle || null,
        description: formData.description
          ? toProductDescriptionHtml(formData.description)
          : null,
        handle: formData.handle || null,
        is_giftcard: false,
        discountable: formData.discountable !== false,
        category_ids: formData.categories || [],
        collection_id: formData.collection || null,
        tags: formData.tags || [],
        images: allImageUrls.map((url) => ({ url })),
        thumbnail:
          formData.thumbnailUrl ||
          firstVisualImages?.[0] ||
          allImageUrls[0] ||
          null,
        options: productOptions,
        variants: variants,
        shipping_profile_id: formData.shippingProfile || null,
        // Physical attributes
        height: parseNumber(formData.height),
        width: parseNumber(formData.width),
        length: parseNumber(formData.length),
        weight: parseNumber(formData.weight),
        metadata: {
          categories: formData.categories,
          tags: formData.tags,
          brand: formData.brand || null,
          mid_code: formData.midCode || null,
          hs_code: formData.hsCode || null,
          tax_code: formData.taxCode || null,
          gst_rate:
            formData.gstRate !== "" && formData.gstRate != null
              ? Number(formData.gstRate)
              : null,
          country_of_origin: formData.countryOfOrigin || null,
          return_window_days: returnWindowDays,
          replacement_window_days: replacementWindowDays,
          return_replacement_policy_configured: true,
          ...(migrateSourceMeta?.source_url
            ? {
                source_url: migrateSourceMeta.source_url,
                source: migrateSourceMeta.source || "oweg.in_scrape",
              }
            : {}),
          ...(Object.keys(serializedColorImages).length > 0
            ? {
                color_images: serializedColorImages,
                primary_visual_option: primaryVisualOption || null,
              }
            : {}),
          videos: formData.uploadedVideos.length > 0
            ? formData.uploadedVideos.map(v => ({ url: v.url, key: v.key, filename: v.filename }))
            : null,
          // Category request — populated when vendor types a new category not in the list
          ...(formData.categoryRequest.trim() ? {
            category_request: formData.categoryRequest.trim(),
            category_request_status: "pending",
            category_request_submitted_at: new Date().toISOString(),
          } : {}),
          // Collection request — populated when vendor types a new collection not in the list
          ...(formData.collectionRequest.trim() ? {
            collection_request: formData.collectionRequest.trim(),
            collection_request_status: "pending",
            collection_request_submitted_at: new Date().toISOString(),
          } : {}),
        },
      })

      toast.success("Submitted for review", {
        description:
          "Product saved as draft. An admin must approve it under Vendor Requests before it appears on the store.",
      })
      try {
        localStorage.removeItem("vendor_product_new_draft")
      } catch {
        // ignore
      }
      router.push("/products")
    } catch (e: unknown) {
      const err = e as { message?: string; data?: { message?: string; details?: string; error?: string } }
      const backendMessage =
        err?.data?.message ||
        err?.data?.details ||
        err?.message ||
        "Failed to create product"
      console.error("Product create failed:", err?.data || err)
      if (err?.data?.error === "duplicate_sku") {
        toast.error("SKU already in use", { description: backendMessage })
      } else {
        toast.error("Error", { description: backendMessage })
      }
    } finally {
      setLoading(false)
    }
  }

  const renderSimpleProductMedia = () => (
    <div>
      <Label>
        Photos & videos <span className="text-ui-fg-muted">(Optional)</span>
      </Label>
      <input
        type="file"
        multiple
        accept="image/*,video/*"
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
        className="border-2 border-dashed border-ui-border-base rounded-lg p-8 text-center bg-ui-bg-base cursor-pointer hover:bg-ui-bg-subtle transition-colors"
      >
        <div className="mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto text-ui-fg-muted">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <Text weight="plus" className="mb-1">Upload images and videos</Text>
        <Text size="small" className="text-ui-fg-muted mb-3">
          Drag and drop or click to upload. JPG, PNG, MP4, WebM, MOV, AVI
        </Text>
        <Button
          type="button"
          variant="secondary"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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
      {(uploadingMedia || uploadingImages || uploadingVideos) && (
        <div className="mt-3 p-3 bg-ui-bg-subtle rounded-md">
          <Text size="small" className="text-ui-fg-muted">
            {uploadingMedia ? "Uploading media..." : uploadingImages ? "Uploading images..." : "Uploading videos..."}
          </Text>
        </div>
      )}
      {(formData.uploadedImages.length > 0 || formData.uploadedVideos.length > 0) && (
        <div className="mt-3">
          <div className="flex flex-col gap-2 bg-ui-bg-base border border-ui-border-base rounded-lg p-3">
            {formData.uploadedImages.map((image, idx) => (
              <div
                key={idx}
                className={clx(
                  "flex items-center gap-3 p-3 rounded-md relative",
                  image.url === formData.thumbnailUrl ? "bg-ui-bg-subtle border border-blue-500" : "bg-transparent border border-transparent"
                )}
              >
                <div className="cursor-grab text-ui-fg-muted text-lg px-2" title="Drag to reorder">
                  ⋮⋮
                </div>
                <div className="w-12 h-12 rounded overflow-hidden bg-ui-bg-subtle flex items-center justify-center shrink-0">
                  <img
                    src={image.url}
                    alt={image.originalName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Text size="small" weight="plus" className="block mb-1">
                    {image.originalName}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {image.filename}
                  </Text>
                  {image.url === formData.thumbnailUrl && (
                    <div className="mt-1">
                      <Text size="xsmall" className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded inline-block">
                        Thumbnail
                      </Text>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuIndex(openMenuIndex === idx ? null : idx)}
                    className="bg-none border-none cursor-pointer px-2 text-ui-fg-muted text-lg leading-none"
                  >
                    ⋮
                  </button>
                  {openMenuIndex === idx && (
                    <div
                      ref={(el) => {
                        menuRefs.current[idx] = el
                      }}
                      className="absolute top-full right-0 mt-1 bg-ui-bg-base border border-ui-border-base rounded-md shadow-lg z-50 min-w-[160px]"
                    >
                      <button
                        onClick={() => handleMakeThumbnail(idx)}
                        className="w-full px-3 py-2 text-left bg-none border-none cursor-pointer text-ui-fg-base text-sm flex items-center gap-2 hover:bg-ui-bg-subtle"
                      >
                        <span>🎬</span>
                        <span>Make thumbnail</span>
                      </button>
                      <button
                        onClick={() => handleDeleteImage(idx)}
                        className="w-full px-3 py-2 text-left bg-none border-none cursor-pointer text-red-500 text-sm flex items-center gap-2 border-t border-ui-border-base hover:bg-ui-bg-subtle"
                      >
                        <span>🗑️</span>
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteImage(idx)}
                  className="bg-none border-none cursor-pointer px-2 text-ui-fg-muted text-lg leading-none"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
            {formData.uploadedVideos.map((video, idx) => (
              <div
                key={`video-${idx}`}
                className="flex items-center gap-3 p-3 rounded-md border border-transparent"
              >
                <div className="w-12 h-12 rounded overflow-hidden bg-ui-bg-subtle flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-ui-fg-muted">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <Text size="small" weight="plus" className="block mb-1">
                    {video.originalName}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {video.filename}
                  </Text>
                  <div className="mt-1">
                    <Text size="xsmall" className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded inline-block mr-2">
                      Video
                    </Text>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-[11px] no-underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View video →
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteVideo(idx)}
                  className="bg-none border-none cursor-pointer px-2 text-ui-fg-muted text-lg leading-none"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderBasicsSection = () => (
    <section className="bg-ui-bg-base border border-ui-border-base rounded-xl p-6 mb-6">
      <Heading level="h2" className="mb-1">Product information</Heading>
      <Text size="small" className="text-ui-fg-muted mb-6">
        Name, description, and brand — everything customers see first
      </Text>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <Label>Product name</Label>
          <Input
            value={formData.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Winter jacket"
            required
          />
        </div>

        <div>
          <Label>
            Subtitle <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <Input
            value={formData.subtitle}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, subtitle: e.target.value })}
            placeholder="Warm and cozy"
          />
        </div>

        <div>
          <Label>
            Handle <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-ui-fg-muted">/</span>
            <Input
              value={formData.handle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, handle: e.target.value })}
              placeholder="winter-jacket"
            />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <Label>
          Description <span className="text-ui-fg-muted">(Optional)</span>
        </Label>
        <Text size="small" className="text-ui-fg-muted mb-1 block">
          Plain text is fine — migrated products are converted from oweg HTML automatically.
        </Text>
        <Textarea
          value={formData.description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
          placeholder="A warm and cozy jacket"
          rows={10}
        />
      </div>

      <div className="mb-6">
        <BrandAuthorizationField
          brand={formData.brand}
          onBrandChange={(brand) => setFormData({ ...formData, brand })}
          onAuthorizationStatusChange={(isAuthorized, needsAuthorization) => {
            setBrandIsAuthorized(isAuthorized)
            setBrandNeedsAuthorization(needsAuthorization)
          }}
          onFileSelect={(file) => setBrandAuthorizationFile(file)}
        />
      </div>
    </section>
  )

  const renderTaxAttributesSection = () => (
    <section className="bg-ui-bg-base border border-ui-border-base rounded-xl p-6 mb-6">
      <div className="mb-6">
        <GstTaxCodeField
          value={formData.taxCode}
          suggestFrom={formData.title}
          required
          onChange={(code, rate) =>
            setFormData({
              ...formData,
              taxCode: code,
              gstRate: rate == null ? "" : String(rate),
            })
          }
        />
      </div>

      {/* Attributes Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Label>
              Attributes <span className="text-ui-fg-muted">(Optional)</span>
            </Label>
            <Text size="xsmall" className="mt-1 text-ui-fg-muted">
              Enter height, width, and length in centimetres (cm). Weight is in kilograms (kg).
            </Text>
          </div>
          <button
            className="text-ui-fg-muted p-1 hover:text-ui-fg-base transition-colors"
            title="Options"
          >
            ⋮
          </button>
        </div>

        <div className="bg-ui-bg-base border border-ui-border-base rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-ui-border-base">
            {/* Height */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Height (cm)</Text>
              <Input
                value={formData.height}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, height: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Width */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Width (cm)</Text>
              <Input
                value={formData.width}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, width: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Length */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Length (cm)</Text>
              <Input
                value={formData.length}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, length: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Weight */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Weight (kg)</Text>
              <Input
                value={formData.weight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* HSN code */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">HSN code</Text>
              <Input
                value={formData.hsCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, hsCode: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Country of origin */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Country of origin</Text>
              <Input
                value={formData.countryOfOrigin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

          </div>

          {/* Delivery Charge Status Banner */}
          {isFetchingLogistics ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              <span>Calculating delivery charges from package dimensions & weight...</span>
            </div>
          ) : logisticsEstimate ? (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <span className="text-base">🚚</span>
                <div>
                  <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Delivery Charge: ₹{logisticsEstimate.freight_charge.toFixed(2)} + 18% GST (₹{logisticsEstimate.gst_amount.toFixed(2)}) = ₹{logisticsEstimate.total_logistics_fee.toFixed(2)}
                  </span>
                  <span className="block text-[11px] text-emerald-700/80 dark:text-emerald-400">
                    Applied weight: {logisticsEstimate.applied_weight} kg • Locked in calculator
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center self-start sm:self-auto rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 dark:text-emerald-300">
                Applied to Calculator
              </span>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ui-fg-muted">
              <span>💡 Enter dimensions & weight above to automatically calculate the delivery charge.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )

  const renderOrganizeSection = () => (
    <section className="bg-ui-bg-base border border-ui-border-base rounded-xl p-6 mb-6">
      <Heading level="h2" className="mb-1">Category & organization</Heading>
      <Text size="small" className="text-ui-fg-muted mb-6">
        Where this product lives in your catalog
      </Text>

      <div className="flex items-center gap-3 p-4 bg-ui-bg-base rounded-lg mb-6 border border-ui-border-base">
        <Switch
          checked={formData.discountable}
          onCheckedChange={(checked: boolean) => setFormData({ ...formData, discountable: checked })}
        />
        <div>
          <Text weight="plus">
            Discountable <span className="text-ui-fg-muted">(Optional)</span>
          </Text>
          <Text size="small" className="text-ui-fg-muted">
            When unchecked, discounts will not be applied to this product
          </Text>
        </div>
      </div>

      {/* Category + Collection row */}
      {(() => {
        const rootCats = categories.filter((c) => !c.parent_category_id)
        const selectedParent = categories.find((c) => c.id === selectedParentCatId)
        const subCats = selectedParentCatId
          ? categories.filter((c) => c.parent_category_id === selectedParentCatId)
          : []

        const filteredParents = rootCats.filter((c) =>
          toTitleCase(c.name).toLowerCase().includes(parentCatInput.toLowerCase())
        )
        // Prefix match only — typing "s" should not list every name that merely contains "s"
        const filteredSubs = subCats.filter((c) => {
          const name = toTitleCase(c.name).toLowerCase()
          const q = subCatInput.trim().toLowerCase()
          if (!q) return true
          return name.startsWith(q)
        })
        const filteredCollections = collections.filter((c) =>
          (c.title || "").toLowerCase().includes(collectionInput.toLowerCase())
        )

        const parentMatchesExact = rootCats.some(
          (c) => toTitleCase(c.name).toLowerCase() === parentCatInput.toLowerCase()
        )
        const subMatchesExact = subCats.some(
          (c) => toTitleCase(c.name).toLowerCase() === subCatInput.toLowerCase()
        )
        const colMatchesExact = collections.some(
          (c) => (c.title || "").toLowerCase() === collectionInput.toLowerCase()
        )

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Category combobox */}
            <div>
              <Label>Category <span className="text-ui-fg-muted">(Optional)</span></Label>
              <Text size="small" className="text-ui-fg-muted mb-1">Select existing or type to request a new one</Text>

              {/* Parent category */}
              <div className="relative mb-2">
                <input
                  type="text"
                  value={parentCatInput}
                  placeholder="Search or type parent category…"
                  autoComplete="off"
                  onFocus={() => setShowParentDrop(true)}
                  onBlur={() => setTimeout(() => setShowParentDrop(false), 150)}
                  onChange={(e) => {
                    setParentCatInput(e.target.value)
                    setShowParentDrop(true)
                    // Reset both existing and requested parent when re-typing
                    setSelectedParentCatId("")
                    setRequestedParentName("")
                    setSubCatInput("")
                    setFormData((f) => ({ ...f, categories: [], categoryRequest: "" }))
                  }}
                  className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base text-sm h-10 focus:outline-none focus:border-ui-fg-interactive"
                />
                {selectedParent && !showParentDrop && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-ui-bg-subtle px-2 py-0.5 rounded text-ui-fg-subtle">
                    {toTitleCase(selectedParent.name)}
                  </span>
                )}
                {showParentDrop && (
                  <div className="absolute z-30 w-full mt-1 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredParents.length === 0 && !parentCatInput && (
                      <div className="px-3 py-2 text-sm text-ui-fg-muted">No categories yet</div>
                    )}
                    {filteredParents.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-ui-bg-subtle transition-colors"
                        onMouseDown={() => {
                          setSelectedParentCatId(cat.id)
                          setParentCatInput(toTitleCase(cat.name))
                          setRequestedParentName("")
                          setSubCatInput("")
                          setShowParentDrop(false)
                          // Default to parent; vendor can override by picking/typing a subcategory
                          setFormData((f) => ({ ...f, categories: [cat.id], categoryRequest: "" }))
                        }}
                      >
                        {toTitleCase(cat.name)}
                      </button>
                    ))}
                    {parentCatInput && !parentMatchesExact && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-ui-fg-interactive hover:bg-ui-bg-subtle border-t border-ui-border-base transition-colors"
                        onMouseDown={() => {
                          const name = parentCatInput.trim()
                          setShowParentDrop(false)
                          setSelectedParentCatId("")
                          setRequestedParentName(name)
                          setSubCatInput("")
                          // Store just the parent for now; subcategory input below will refine it
                          setFormData((f) => ({
                            ...f,
                            categories: [],
                            categoryRequest: name,
                          }))
                        }}
                      >
                        + Request new: &ldquo;{parentCatInput.trim()}&rdquo;
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Subcategory — shown when an existing parent is selected OR a new parent was requested */}
              {(selectedParentCatId || requestedParentName) && (
                <div className="relative">
                  <div className="flex items-center gap-1 mb-1">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Subcategory under{" "}
                      <span className="font-medium">
                        {selectedParent ? toTitleCase(selectedParent.name) : requestedParentName}
                      </span>
                      {requestedParentName && (
                        <span className="ml-1 text-amber-500">(new — will be requested)</span>
                      )}
                    </Text>
                    {subCatInput && (
                      <button
                        type="button"
                        className="text-xs text-ui-fg-muted hover:text-ui-fg-subtle ml-auto"
                        onClick={() => {
                          setSubCatInput("")
                          // Restore either parent ID or root request
                          if (selectedParentCatId) {
                            setFormData((f) => ({ ...f, categories: [selectedParentCatId], categoryRequest: "" }))
                          } else {
                            setFormData((f) => ({ ...f, categories: [], categoryRequest: requestedParentName }))
                          }
                        }}
                      >
                        ✕ clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={subCatInput}
                    placeholder={
                      subCats.length > 0
                        ? `Search subcategory…`
                        : `Type a subcategory name…`
                    }
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onFocus={() => setShowSubDrop(true)}
                    onBlur={() => setTimeout(() => setShowSubDrop(false), 150)}
                    onChange={(e) => {
                      const val = e.target.value
                      setSubCatInput(val)
                      setShowSubDrop(true)

                      const exact = subCats.find(
                        (c) =>
                          toTitleCase(c.name).toLowerCase() === val.trim().toLowerCase()
                      )
                      if (exact) {
                        setFormData((f) => ({
                          ...f,
                          categories: [exact.id],
                          categoryRequest: "",
                        }))
                        return
                      }

                      const trimmed = val.trim()
                      if (!trimmed) {
                        if (selectedParentCatId) {
                          setFormData((f) => ({
                            ...f,
                            categories: [selectedParentCatId],
                            categoryRequest: "",
                          }))
                        } else {
                          setFormData((f) => ({
                            ...f,
                            categories: [],
                            categoryRequest: requestedParentName,
                          }))
                        }
                        return
                      }

                      const parentLabel = selectedParent
                        ? toTitleCase(selectedParent.name)
                        : requestedParentName
                      setFormData((f) => ({
                        ...f,
                        categories: [],
                        categoryRequest: `${parentLabel} > ${trimmed}`,
                      }))
                    }}
                    className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base text-sm h-10 focus:outline-none focus:border-ui-fg-interactive"
                  />
                  {showSubDrop && (
                    <div className="absolute z-30 w-full mt-1 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {/* Skip — use parent directly (only when not typing a new name) */}
                      {selectedParentCatId && !subCatInput.trim() && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs text-ui-fg-muted hover:bg-ui-bg-subtle italic transition-colors border-b border-ui-border-base"
                          onMouseDown={() => {
                            setSubCatInput("")
                            setShowSubDrop(false)
                            setFormData((f) => ({
                              ...f,
                              categories: [selectedParentCatId],
                              categoryRequest: "",
                            }))
                          }}
                        >
                          — No subcategory (use {toTitleCase(selectedParent?.name || "")}{" "}
                          directly)
                        </button>
                      )}

                      {filteredSubs.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-ui-bg-subtle transition-colors"
                          onMouseDown={() => {
                            setSubCatInput(toTitleCase(sub.name))
                            setShowSubDrop(false)
                            setFormData((f) => ({
                              ...f,
                              categories: [sub.id],
                              categoryRequest: "",
                            }))
                          }}
                        >
                          {toTitleCase(sub.name)}
                        </button>
                      ))}

                      {!subCatInput.trim() && subCats.length === 0 && (
                        <div className="px-3 py-2 text-xs text-ui-fg-muted italic">
                          Type a subcategory name to request it
                        </div>
                      )}

                      {subCatInput.trim() && !subMatchesExact && (
                        <div className="px-3 py-2 text-xs text-amber-700 border-t border-ui-border-base">
                          Will request:{" "}
                          {(selectedParent
                            ? toTitleCase(selectedParent.name)
                            : requestedParentName)}{" "}
                          › {subCatInput.trim()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Show selected or requested value */}
              {formData.categories[0] && (
                <Text size="small" className="text-green-700 mt-1">
                  ✓ {toTitleCase(categories.find((c) => c.id === formData.categories[0])?.name || "")}
                </Text>
              )}
              {formData.categoryRequest && !formData.categories[0] && (
                <Text size="small" className="text-amber-600 mt-1">
                  Requesting: &ldquo;{formData.categoryRequest}&rdquo;
                </Text>
              )}
            </div>

            {/* Collection combobox — labeled Brand in UI only */}
            <div>
              <Label>Brand <span className="text-ui-fg-muted">(Optional)</span></Label>
              <Text size="small" className="text-ui-fg-muted mb-1">Select existing or type to request a new one</Text>
              <div className="relative">
                <input
                  type="text"
                  value={collectionInput}
                  placeholder="Search or type brand…"
                  autoComplete="off"
                  onFocus={() => setShowCollectionDrop(true)}
                  onBlur={() => setTimeout(() => setShowCollectionDrop(false), 150)}
                  onChange={(e) => {
                    setCollectionInput(e.target.value)
                    setShowCollectionDrop(true)
                    setFormData((f) => ({ ...f, collection: "", collectionRequest: "" }))
                  }}
                  className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base text-sm h-10 focus:outline-none focus:border-ui-fg-interactive"
                />
                {showCollectionDrop && (
                  <div className="absolute z-30 w-full mt-1 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredCollections.length === 0 && !collectionInput && (
                      <div className="px-3 py-2 text-sm text-ui-fg-muted">No brands yet</div>
                    )}
                    {filteredCollections.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-ui-bg-subtle transition-colors"
                        onMouseDown={() => {
                          setCollectionInput(col.title || "")
                          setShowCollectionDrop(false)
                          setFormData((f) => ({ ...f, collection: col.id, collectionRequest: "" }))
                        }}
                      >
                        {col.title}
                      </button>
                    ))}
                    {collectionInput && !colMatchesExact && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-ui-fg-interactive hover:bg-ui-bg-subtle border-t border-ui-border-base transition-colors"
                        onMouseDown={() => {
                          setShowCollectionDrop(false)
                          setFormData((f) => ({
                            ...f,
                            collection: "",
                            collectionRequest: collectionInput.trim(),
                          }))
                        }}
                      >
                        + Request new: &ldquo;{collectionInput.trim()}&rdquo;
                      </button>
                    )}
                  </div>
                )}
              </div>
              {formData.collection && (
                <Text size="small" className="text-green-700 mt-1">
                  ✓ {collections.find((c) => c.id === formData.collection)?.title || ""}
                </Text>
              )}
              {formData.collectionRequest && !formData.collection && (
                <Text size="small" className="text-amber-600 mt-1">
                  Requesting: &ldquo;{formData.collectionRequest}&rdquo;
                </Text>
              )}
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>
            Type <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <input
            list="product-types-list"
            value={formData.type}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, type: e.target.value })
            }
            placeholder={productTypes.length > 0 ? "Select or type new…" : "e.g. Apparel, Electronics…"}
            className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base text-sm h-10 focus:outline-none focus:border-ui-fg-interactive"
          />
          <datalist id="product-types-list">
            {productTypes.map((t) => (
              <option key={t.id} value={t.value} />
            ))}
          </datalist>
          {formData.type && !productTypes.some((t) => t.value?.toLowerCase() === formData.type.toLowerCase()) && (
            <Text size="xsmall" className="text-emerald-600 mt-1">
              New type — will be created automatically
            </Text>
          )}
        </div>

        <div>
          <Label>
            Tags <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <Text size="small" className="text-ui-fg-muted mb-1">
            Press Enter or comma to add each tag
          </Text>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-ui-border-base bg-ui-bg-base p-1.5 focus-within:border-ui-fg-interactive">
            {formData.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-ui-border-base bg-ui-bg-subtle px-2.5 py-0.5 text-sm"
              >
                {tag}
                <button
                  type="button"
                  className="text-ui-fg-muted hover:text-ui-fg-base"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    setFormData((f) => ({
                      ...f,
                      tags: f.tags.filter((t) => t !== tag),
                    }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              placeholder={formData.tags.length ? "Add another…" : "e.g. winter"}
              className="min-w-[120px] flex-1 border-0 bg-transparent px-1.5 py-1 text-sm outline-none"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  const next = tagDraft.replace(/,/g, "").trim()
                  if (!next) return
                  setFormData((f) => {
                    if (f.tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
                      return f
                    }
                    return { ...f, tags: [...f.tags, next] }
                  })
                  setTagDraft("")
                } else if (e.key === "Backspace" && !tagDraft && formData.tags.length) {
                  setFormData((f) => ({ ...f, tags: f.tags.slice(0, -1) }))
                }
              }}
              onBlur={() => {
                const next = tagDraft.trim()
                if (!next) return
                setFormData((f) => {
                  if (f.tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
                    return f
                  }
                  return { ...f, tags: [...f.tags, next] }
                })
                setTagDraft("")
              }}
            />
          </div>
        </div>
      </div>

      {/* Shipping profile (Optional) - commented out as requested
      <div className="mb-6">
        <Label>
          Shipping profile <span className="text-ui-fg-muted">(Optional)</span>
        </Label>
        <Text size="small" className="text-ui-fg-muted mb-2">
          Connect the product to a shipping profile
        </Text>
        <Input
          value={formData.shippingProfile}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, shippingProfile: e.target.value })}
          placeholder="Select shipping profile"
        />
      </div>
      */}

    </section>
  )

  const renderVariantsSection = () => (
    <VariantMatrixEditor
      hasVariants={formData.hasVariants}
      onHasVariantsChange={(enabled) =>
        setFormData((prev) => ({
          ...prev,
          hasVariants: enabled,
          productOptions: enabled
            ? [
                { title: "Color", values: [], valuesInput: "" },
                { title: "Size", values: [], valuesInput: "" },
              ]
            : [],
          variants: enabled ? [] : [createDefaultVariantRow()],
          colorImages: enabled ? prev.colorImages : {},
          uploadedImages: enabled ? [] : prev.uploadedImages,
          uploadedVideos: enabled ? [] : prev.uploadedVideos,
          thumbnailUrl: enabled ? null : prev.thumbnailUrl,
        }))
      }
      productOptions={formData.productOptions}
      onProductOptionsChange={(productOptions) =>
        setFormData((prev) => ({ ...prev, productOptions }))
      }
      variants={formData.variants}
      onVariantsChange={(variants) => setFormData((prev) => ({ ...prev, variants }))}
      colorImages={formData.colorImages}
      onColorImagesChange={(colorImages) =>
        setFormData((prev) => ({ ...prev, colorImages }))
      }
      primaryVisualOption={formData.primaryVisualOption}
      onPrimaryVisualOptionChange={(primaryVisualOption) =>
        setFormData((prev) => ({ ...prev, primaryVisualOption }))
      }
      usedSkus={usedSkus}
      simpleProductExtras={!formData.hasVariants ? renderSimpleProductMedia() : undefined}
      policyExtras={
        <ReturnReplacementPolicyFields
          value={formData.returnReplacementPolicy}
          onChange={(returnReplacementPolicy) =>
            setFormData((prev) => ({ ...prev, returnReplacementPolicy }))
          }
        />
      }
      taxAttributesExtras={renderTaxAttributesSection()}
      productGstRate={formData.gstRate}
      taxCode={formData.taxCode}
      logisticsFee={logisticsEstimate ? logisticsEstimate.freight_charge : DEFAULT_LOGISTICS_FEE}
      isLogisticsReadOnly={true}
      logisticsDetails={logisticsEstimate}
      isFetchingLogistics={isFetchingLogistics}
    />
  )

  const canPublish =
    Boolean(formData.title?.trim()) &&
    Boolean(formData.brand?.trim()) &&
    Boolean(formData.taxCode?.trim()) &&
    brandIsAuthorized &&
    !loading

  return (
    <VendorShell>
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
        {(shareLoading || shareError || sharedProduct) && <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {shareLoading ? "Loading shared product and images…" : shareError || "Shared catalog product: review the details, then enter your own price and stock. Your brand authorization is still required."}
        </div>}
        {sharedProduct && !shareError && formData.uploadedImages.length > 0 && <div className="mb-6 rounded-xl border border-ui-border-base p-4">
          <Text className="mb-3 font-medium">Catalog images</Text>
          <div className="flex flex-wrap gap-3">{formData.uploadedImages.map((image, index) => <Image key={`${image.url}-${index}`} src={image.url} alt={`Shared product image ${index + 1}`} width={96} height={96} unoptimized className="h-24 w-24 rounded-lg border object-contain" />)}</div>
        </div>}

        <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6 bg-ui-bg-base/95 backdrop-blur border-b border-ui-border-base flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push("/products")}
              className="bg-none border-none cursor-pointer text-ui-fg-muted text-2xl shrink-0 hover:text-ui-fg-base"
              aria-label="Close"
            >
              ×
            </button>
            <div className="min-w-0">
              <Heading level="h1" className="truncate">Add product</Heading>
              <Text size="small" className="text-ui-fg-muted hidden sm:block">
                One page — info, category, photos, and pricing together
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={loading || !formData.title?.trim()}
              className="shrink-0"
            >
              Save in draft
            </Button>
            {migrateReady && (
              <Button
                variant="secondary"
                onClick={handleSubmit}
                isLoading={loading}
                disabled={!canPublish || migrating || shareLoading || !!shareError}
              >
                Save now
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={loading}
              disabled={!canPublish || migrating || shareLoading || !!shareError}
              className="shrink-0"
            >
              Publish
            </Button>
          </div>
        </div>

        {/* Draft Notice Banner */}
        {availableDraft && (
          <div className="mb-6 rounded-xl border border-amber-300/80 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📝</span>
              <div>
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  There is a draft product: &ldquo;{availableDraft.formData.title}&rdquo;
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-300">
                  Do you want to publish it?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <Button size="small" variant="secondary" onClick={handleDiscardDraft}>
                Discard
              </Button>
              <Button size="small" variant="primary" onClick={handleLoadDraft}>
                Review & Publish
              </Button>
            </div>
          </div>
        )}

        {/* Modal Prompt on Page Load if Draft Exists */}
        {draftPromptOpen && availableDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-md rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <span className="text-2xl">📝</span>
                </div>
                <div>
                  <Heading level="h2" className="text-base font-semibold">
                    Draft product found
                  </Heading>
                  <Text size="small" className="text-ui-fg-muted">
                    {availableDraft.savedAt
                      ? `Saved on ${new Date(availableDraft.savedAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "Unpublished draft"}
                  </Text>
                </div>
              </div>

              <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-ui-fg-base mb-1 truncate">
                  &ldquo;{availableDraft.formData.title}&rdquo;
                </p>
                <p className="text-xs text-ui-fg-muted">
                  There is a draft product. Do you want to publish it?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <Button
                  variant="secondary"
                  onClick={handleDiscardDraft}
                >
                  Start fresh
                </Button>
                <Button
                  variant="primary"
                  onClick={handleLoadDraft}
                >
                  Yes, publish it
                </Button>
              </div>
            </div>
          </div>
        )}

        <div
          id="migrate"
          className="mb-6 scroll-mt-28 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:p-5"
        >
          <Heading level="h2" className="mb-1">
            Migrate from oweg.in
          </Heading>
          <Text size="small" className="text-ui-fg-muted mb-3">
            Paste a product link from oweg.in. We&apos;ll pull title, description, prices, variants,
            and images (uploaded to your S3), then prefill this form so you can review before saving.
          </Text>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={migrateUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMigrateUrl(e.target.value)}
              placeholder="https://www.oweg.in/your-product-slug"
              className="flex-1"
              disabled={migrating}
            />
            <Button
              variant="secondary"
              onClick={handleMigrateFromOweg}
              isLoading={migrating}
              disabled={migrating || loading}
              className="shrink-0"
            >
              Fetch product
            </Button>
          </div>
          {migrateReady && (
            <Text size="small" className="text-green-700 mt-3">
              Product data loaded. Review the fields below, then click Save now or Publish.
            </Text>
          )}
          {migrateWarnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <Text size="small" weight="plus" className="text-amber-900 mb-1">
                Warnings
              </Text>
              <ul className="list-disc pl-5 space-y-1">
                {migrateWarnings.map((warning) => (
                  <li key={warning}>
                    <Text size="small" className="text-amber-900">
                      {warning}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {renderBasicsSection()}
        {renderVariantsSection()}
        {renderOrganizeSection()}

        <div className="flex justify-end gap-3 mt-4 pb-8">
          <Button variant="secondary" onClick={() => router.push("/products")} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            disabled={loading || !formData.title?.trim()}
          >
            Save in draft
          </Button>
          {migrateReady && (
            <Button
              variant="secondary"
              onClick={handleSubmit}
              isLoading={loading}
              disabled={!canPublish || migrating || shareLoading || !!shareError}
            >
              Save now
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={loading}
            disabled={!canPublish || migrating || shareLoading || !!shareError}
          >
            Publish product
          </Button>
        </div>
      </div>
    </VendorShell>
  )
}

export default VendorProductNewPage
