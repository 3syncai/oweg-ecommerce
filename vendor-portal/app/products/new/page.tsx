"use client"

import React, { useState, useEffect, useRef } from "react"
import { Heading, Text, Button, Input, Textarea, Label, Switch, toast, clx } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { useRouter } from "next/navigation"
import { BrandAuthorizationField } from "@/components/BrandAuthorizationField"
import VariantMatrixEditor from "@/components/VariantMatrixEditor"
import { vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi, vendorTypesApi } from "@/lib/api/client"
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
import axios from "axios"

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
}

const VendorProductNewPage = () => {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
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
  })

  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingVideos, setUploadingVideos] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [brandIsAuthorized, setBrandIsAuthorized] = useState(false)
  const [brandNeedsAuthorization, setBrandNeedsAuthorization] = useState(false)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [brandAuthorizationFile, setBrandAuthorizationFile] = useState<File | null>(null)
  const menuRefs = React.useRef<{ [key: number]: HTMLDivElement | null }>({})

  useEffect(() => {
    fetchCategoriesAndCollections()
  }, [])

  const fetchCategoriesAndCollections = async () => {
    try {
      const token = localStorage.getItem("vendor_token")
      if (!token) return

      const [categoriesData, collectionsData, typesData] = await Promise.all([
        vendorCategoriesApi.list({ limit: 100 }),
        vendorCollectionsApi.list({ limit: 100 }),
        vendorTypesApi.list({ limit: 200 }),
      ])

      setCategories(categoriesData.product_categories || [])
      setCollections(collectionsData.collections || [])
      setProductTypes(typesData.product_types || [])
    } catch (error) {
      console.error("Failed to fetch data:", error)
    }
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      await uploadMediaToS3(files)
    }
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleVideoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
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
    // Final brand-gate so users can't bypass via direct Publish click after
    // editing form state.
    if (!formData.title) {
      toast.error("Error", { description: "Title is required" })
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

      const skus = formData.variants.map((v) => v.sku.trim()).filter(Boolean)
      if (skus.length !== new Set(skus).size) {
        toast.error("Duplicate SKU", { description: "Each variant needs a different SKU (or leave all blank)" })
        return
      }
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
        title: formData.title,
        subtitle: formData.subtitle || null,
        description: formData.description || null,
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
          country_of_origin: formData.countryOfOrigin || null,
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

      toast.success("Success", { description: "Product created successfully" })
      router.push("/products")
    } catch (e: unknown) {
      const err = e as { message?: string; data?: { message?: string; details?: string } }
      const backendMessage =
        err?.data?.message ||
        err?.data?.details ||
        err?.message ||
        "Failed to create product"
      console.error("Product create failed:", err?.data || err)
      toast.error("Error", { description: backendMessage })
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
          <Label>Title</Label>
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
        <Textarea
          value={formData.description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
          placeholder="A warm and cozy jacket"
          rows={4}
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

      {/* Attributes Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <Label>
            Attributes <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
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
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Height</Text>
              <Input
                value={formData.height}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, height: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Width */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Width</Text>
              <Input
                value={formData.width}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, width: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Length */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Length</Text>
              <Input
                value={formData.length}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, length: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Weight */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Weight</Text>
              <Input
                value={formData.weight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* MID code */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">MID code</Text>
              <Input
                value={formData.midCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, midCode: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* HS code */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">HS code</Text>
              <Input
                value={formData.hsCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, hsCode: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

            {/* Country of origin */}
            <div className="p-3 md:p-4 bg-ui-bg-base flex items-center gap-3 col-span-1 md:col-span-2">
              <Text size="small" className="min-w-[120px] text-ui-fg-muted">Country of origin</Text>
              <Input
                value={formData.countryOfOrigin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                placeholder="-"
                className="flex-1"
              />
            </div>

          </div>
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
        const filteredSubs = subCats.filter((c) =>
          toTitleCase(c.name).toLowerCase().includes(subCatInput.toLowerCase())
        )
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
                        ? `e.g. ${subCats.slice(0, 2).map((s) => toTitleCase(s.name)).join(", ")}…`
                        : `e.g. Jeans, T-Shirt, Kurta…`
                    }
                    autoComplete="off"
                    onFocus={() => setShowSubDrop(true)}
                    onBlur={() => setTimeout(() => setShowSubDrop(false), 150)}
                    onChange={(e) => {
                      const val = e.target.value
                      setSubCatInput(val)
                      setShowSubDrop(true)
                      setFormData((f) => ({ ...f, categories: [], categoryRequest: "" }))
                    }}
                    className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base text-sm h-10 focus:outline-none focus:border-ui-fg-interactive"
                  />
                  {showSubDrop && (
                    <div className="absolute z-30 w-full mt-1 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {/* Skip — use parent directly (only makes sense for existing parents) */}
                      {selectedParentCatId && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs text-ui-fg-muted hover:bg-ui-bg-subtle italic transition-colors border-b border-ui-border-base"
                          onMouseDown={() => {
                            setSubCatInput("")
                            setShowSubDrop(false)
                            setFormData((f) => ({ ...f, categories: [selectedParentCatId], categoryRequest: "" }))
                          }}
                        >
                          — No subcategory (use {toTitleCase(selectedParent?.name || "")} directly)
                        </button>
                      )}

                      {/* Existing subcategories (only available when parent exists in DB) */}
                      {filteredSubs.length > 0 && filteredSubs.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-ui-bg-subtle transition-colors"
                          onMouseDown={() => {
                            setSubCatInput(toTitleCase(sub.name))
                            setShowSubDrop(false)
                            setFormData((f) => ({ ...f, categories: [sub.id], categoryRequest: "" }))
                          }}
                        >
                          {toTitleCase(sub.name)}
                        </button>
                      ))}

                      {/* Hints */}
                      {subCats.length > 0 && filteredSubs.length === 0 && subCatInput && (
                        <div className="px-3 py-2 text-xs text-ui-fg-muted">No match — request a new one below</div>
                      )}
                      {!subCatInput && subCats.length === 0 && (
                        <div className="px-3 py-2 text-xs text-ui-fg-muted italic">
                          Type a subcategory name to request it
                        </div>
                      )}

                      {/* Request new sub — works for both existing and new parents */}
                      {subCatInput && !subMatchesExact && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-ui-fg-interactive hover:bg-ui-bg-subtle border-t border-ui-border-base transition-colors"
                          onMouseDown={() => {
                            const parentLabel = selectedParent
                              ? toTitleCase(selectedParent.name)
                              : requestedParentName
                            setShowSubDrop(false)
                            setFormData((f) => ({
                              ...f,
                              categories: [],
                              categoryRequest: `${parentLabel} > ${subCatInput.trim()}`,
                            }))
                          }}
                        >
                          + Request: &ldquo;{
                            (selectedParent ? toTitleCase(selectedParent.name) : requestedParentName)
                          } &rsaquo; {subCatInput.trim()}&rdquo;
                        </button>
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

            {/* Collection combobox */}
            <div>
              <Label>Collection <span className="text-ui-fg-muted">(Optional)</span></Label>
              <Text size="small" className="text-ui-fg-muted mb-1">Select existing or type to request a new one</Text>
              <div className="relative">
                <input
                  type="text"
                  value={collectionInput}
                  placeholder="Search or type collection…"
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
                      <div className="px-3 py-2 text-sm text-ui-fg-muted">No collections yet</div>
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
          <Input
            value={formData.tags.join(", ")}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, tags: e.target.value.split(",").map((t: string) => t.trim()).filter((t: string) => t) })}
            placeholder="winter, jacket, outdoor"
          />
        </div>
      </div>

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

      <div>
        <div className="mb-2">
          <Label>
            Sales channels <span className="text-ui-fg-muted">(Fixed)</span>
          </Label>
          <Text size="small" className="text-ui-fg-muted">
            Sales channel is automatically set and cannot be modified. Products are assigned to the default sales channel.
          </Text>
        </div>
        <div className="flex gap-2 flex-wrap">
          {formData.salesChannels.map((channel, idx) => (
            <div
              key={idx}
              className="px-3 py-1.5 bg-ui-bg-subtle-hover border border-ui-border-base rounded-md flex items-center gap-2 opacity-70 cursor-not-allowed"
            >
              <Text size="small">{channel}</Text>
            </div>
          ))}
        </div>
      </div>
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
      simpleProductExtras={!formData.hasVariants ? renderSimpleProductMedia() : undefined}
    />
  )

  const canPublish =
    Boolean(formData.title?.trim()) &&
    Boolean(formData.brand?.trim()) &&
    brandIsAuthorized &&
    !loading

  return (
    <VendorShell>
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
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
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={loading}
            disabled={!canPublish}
            className="shrink-0"
          >
            Publish
          </Button>
        </div>

        {renderBasicsSection()}
        {renderOrganizeSection()}
        {renderVariantsSection()}

        <div className="flex justify-end gap-3 mt-4 pb-8">
          <Button variant="secondary" onClick={() => router.push("/products")} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={loading}
            disabled={!canPublish}
          >
            Publish product
          </Button>
        </div>
      </div>
    </VendorShell>
  )
}

export default VendorProductNewPage
