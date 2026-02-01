"use client"

import React, { useState, useEffect, useRef } from "react"
import { Heading, Text, Button, Input, Textarea, Label, Switch, toast, clx } from "@medusajs/ui"
import { CheckCircleSolid, CircleMiniSolid } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import { useRouter } from "next/navigation"
import { BrandAuthorizationField } from "@/components/BrandAuthorizationField"
import { vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi } from "@/lib/api/client"
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
    inventoryCount: string
    price: string
    discountedPrice: string
  }>
}

type Step = "details" | "organize" | "variants"

const VendorProductNewPage = () => {
  const router = useRouter()
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
    tags: [],
    shippingProfile: "",
    salesChannels: ["Default Sales Channel"],
    variants: [{
      title: "Default variant",
      sku: "",
      managedInventory: true,
      allowBackorder: true,
      hasInventoryKit: true,
      inventoryCount: "",
      price: "",
      discountedPrice: "",
    }],
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

      const [categoriesData, collectionsData] = await Promise.all([
        vendorCategoriesApi.list({ limit: 100 }),
        vendorCollectionsApi.list({ limit: 100 }),
      ])

      setCategories(categoriesData.product_categories || [])
      setCollections(collectionsData.collections || [])
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

      // Use already uploaded images
      const imageUrls = formData.uploadedImages.map(img => img.url)

      // Prepare variant data - create a default variant if no variants specified
      const variants = formData.variants && formData.variants.length > 0
        ? formData.variants.map((v) => ({
          title: v.title || "Default variant",
          sku: v.sku || undefined,
          manage_inventory: v.managedInventory,
          allow_backorder: v.allowBackorder,
          prices: v.price ? [
            // Base price (no price_list_id)
            {
              amount: parseFloat(v.price),
              currency_code: "inr",
            },
            // Discounted price (with price_list_id) - only if provided
            ...(v.discountedPrice ? [{
              amount: parseFloat(v.discountedPrice),
              currency_code: "inr",
              price_list_id: "pl_1765232034558" // India price list
            }] : [])
          ] : [],
          inventory_quantity: Math.max(0, Math.floor(Number.parseInt(v.inventoryCount, 10)) || 0),
        }))
        : [
          {
            title: "Default variant",
            prices: [],
          }
        ]

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
        images: imageUrls.map((url) => ({ url })),
        thumbnail: formData.thumbnailUrl || imageUrls[0] || null,
        options: [], // No product options for simple products
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
          // Additional attributes in metadata
          mid_code: formData.midCode || null,
          hs_code: formData.hsCode || null,
          country_of_origin: formData.countryOfOrigin || null,
          // Videos
          videos: formData.uploadedVideos.length > 0
            ? formData.uploadedVideos.map(v => ({ url: v.url, key: v.key, filename: v.filename }))
            : null,
        },
      })

      toast.success("Success", { description: "Product created successfully" })
      router.push("/products")
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
      <div className="flex flex-col md:flex-row gap-2 md:gap-8 mb-8">
        <button
          onClick={() => setCurrentStep("details")}
          className={clx(
            "flex-1 flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors border md:border-none",
            currentStep === "details"
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-transparent text-ui-fg-base border-ui-border-base hover:bg-ui-bg-base-hover"
          )}
        >
          <span className="flex items-center justify-center w-6 h-6">
            {isDetailsComplete ? (
              <CheckCircleSolid className="text-blue-500" />
            ) : (
              <CircleMiniSolid className="text-white" />
            )}
          </span>
          <span>Details</span>
        </button>

        <button
          onClick={() => formData.title && setCurrentStep("organize")}
          disabled={!formData.title}
          className={clx(
            "flex-1 flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors border md:border-none",
            currentStep === "organize"
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-transparent text-ui-fg-base border-ui-border-base",
            !formData.title && "opacity-50 cursor-not-allowed",
            formData.title && currentStep !== "organize" && "hover:bg-ui-bg-base-hover"
          )}
        >
          <span className="flex items-center justify-center w-6 h-6">
            {isOrganizeComplete ? (
              <CheckCircleSolid className={currentStep === "organize" ? "text-white" : "text-blue-500"} />
            ) : (
              <CircleMiniSolid className={currentStep === "organize" ? "text-white" : "text-ui-fg-muted"} />
            )}
          </span>
          <span>Organize</span>
        </button>

        <button
          onClick={() => formData.title && setCurrentStep("variants")}
          disabled={!formData.title}
          className={clx(
            "flex-1 flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors border md:border-none",
            currentStep === "variants"
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-transparent text-ui-fg-base border-ui-border-base",
            !formData.title && "opacity-50 cursor-not-allowed",
            formData.title && currentStep !== "variants" && "hover:bg-ui-bg-base-hover"
          )}
        >
          <span className="flex items-center justify-center w-6 h-6">
            <CircleMiniSolid className={currentStep === "variants" ? "text-white" : "text-ui-fg-muted"} />
          </span>
          <span>Variants</span>
        </button>
      </div>
    )
  }

  const renderDetailsStep = () => (
    <div className="max-w-[1200px]">
      <Heading level="h2" className="mb-4">General</Heading>

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

      <div>
        <Label>
          Media <span className="text-ui-fg-muted">(Optional)</span>
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
          className="border-2 border-dashed border-ui-border-base rounded-lg p-12 text-center bg-ui-bg-base cursor-pointer hover:bg-ui-bg-subtle transition-colors"
        >
          <div className="mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto text-ui-fg-muted">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <Text weight="plus" className="mb-1">Upload images and videos</Text>
          <Text size="small" className="text-ui-fg-muted mb-4">
            Drag and drop images or videos here or click to upload. Supported formats: Images (JPG, PNG, etc.) and Videos (MP4, WebM, MOV, AVI)
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
          <div className="mt-4 p-3 bg-ui-bg-subtle rounded-md">
            <Text size="small" className="text-ui-fg-muted">
              {uploadingMedia ? "Uploading media..." : uploadingImages ? "Uploading images..." : "Uploading videos..."}
            </Text>
          </div>
        )}
        {(formData.uploadedImages.length > 0 || formData.uploadedVideos.length > 0) && (
          <div className="mt-4">
            <div className="flex flex-col gap-2 bg-ui-bg-base border border-ui-border-base rounded-lg p-3">
              {/* Display Images */}
              {formData.uploadedImages.map((image, idx) => (
                <div
                  key={idx}
                  className={clx(
                    "flex items-center gap-3 p-3 rounded-md relative",
                    image.url === formData.thumbnailUrl ? "bg-ui-bg-subtle border border-blue-500" : "bg-transparent border border-transparent"
                  )}
                >
                  {/* Drag handle */}
                  <div
                    className="cursor-grab text-ui-fg-muted text-lg px-2"
                    title="Drag to reorder"
                  >
                    ⋮⋮
                  </div>

                  {/* Image thumbnail */}
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

                  {/* File info */}
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

                  {/* Actions */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuIndex(openMenuIndex === idx ? null : idx)}
                      className="bg-none border-none cursor-pointer px-2 text-ui-fg-muted text-lg leading-none"
                    >
                      ⋮
                    </button>

                    {/* Context menu */}
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

                  {/* Delete button (X) */}
                  <button
                    onClick={() => handleDeleteImage(idx)}
                    className="bg-none border-none cursor-pointer px-2 text-ui-fg-muted text-lg leading-none"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Display Videos */}
              {formData.uploadedVideos.map((video, idx) => (
                <div
                  key={`video - ${idx}`}
                  className="flex items-center gap-3 p-3 rounded-md border border-transparent"
                >
                  {/* Video icon/thumbnail */}
                  <div className="w-12 h-12 rounded overflow-hidden bg-ui-bg-subtle flex items-center justify-center shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-ui-fg-muted">
                      <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* File info */}
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

                  {/* Delete button */}
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

            {/* Brand with Authorization Check */}
            <div className="bg-ui-bg-base col-span-1 md:col-span-2">
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
          </div>
        </div>
      </div>
    </div>
  )

  const renderOrganizeStep = () => (
    <div className="max-w-[1200px]">
      <Heading level="h2" className="mb-4">Organize</Heading>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>
            Type <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <Input
            value={formData.type}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, type: e.target.value })}
            placeholder="Select type"
          />
        </div>

        <div>
          <Label>
            Collection <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <select
            value={formData.collection}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, collection: e.target.value })}
            className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base h-10"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>
            Categories <span className="text-ui-fg-muted">(Optional)</span>
          </Label>
          <select
            value={formData.categories[0] || ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setFormData({ ...formData, categories: e.target.value ? [e.target.value] : [] })
            }}
            className="w-full p-2 bg-ui-bg-base border border-ui-border-base rounded-lg text-ui-fg-base cursor-pointer h-10"
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
    </div>
  )

  const renderVariantsStep = () => (
    <div className="max-w-[1200px]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <Button variant="secondary" size="small">
            <span className="mr-2">☰</span>
            View
          </Button>
        </div>
        <Text size="small" className="text-ui-fg-muted">
          Shortcuts
        </Text>
      </div>

      {/* Sales Channels Section - Read Only */}
      <div className="mb-6 p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
        <Label className="mb-2 block">
          Sales channels <span className="text-ui-fg-muted">(Fixed)</span>
        </Label>
        <Text size="small" className="text-ui-fg-muted mb-3 block">
          Sales channel is automatically set and cannot be modified. Products are assigned to the default sales channel.
        </Text>
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

      <div className="bg-ui-bg-base border border-ui-border-base rounded-lg overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="bg-ui-bg-subtle border-b border-ui-border-base">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Default option
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                SKU
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Managed inventory
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Allow backorder
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Has inventory kit
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Inventory Count
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Price INR
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Discounted Price INR
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Discount %
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ui-fg-muted uppercase tracking-wider">

              </th>
            </tr>
          </thead>
          <tbody>
            {formData.variants.map((variant, idx) => (
              <tr key={idx} className="border-b border-ui-border-base">
                <td className="px-4 py-3">
                  <Text size="small">Default option value</Text>
                </td>
                <td className="px-4 py-3">
                  <Input
                    value={variant.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].title = e.target.value
                      setFormData({ ...formData, variants: newVariants })
                    }}
                    placeholder="Default variant"
                    className="w-full"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    value={variant.sku}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].sku = e.target.value
                      setFormData({ ...formData, variants: newVariants })
                    }}
                    className="w-full"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={variant.managedInventory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].managedInventory = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={variant.allowBackorder}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].allowBackorder = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={variant.hasInventoryKit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].hasInventoryKit = e.target.checked
                      setFormData({ ...formData, variants: newVariants })
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={variant.inventoryCount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newVariants = [...formData.variants]
                      newVariants[idx].inventoryCount = e.target.value
                      setFormData({ ...formData, variants: newVariants })
                    }}
                    placeholder="0"
                    style={{ width: 100 }}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-ui-fg-muted">₹</span>
                    <Input
                      value={variant.price}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newVariants = [...formData.variants]
                        newVariants[idx].price = e.target.value
                        setFormData({ ...formData, variants: newVariants })
                      }}
                      placeholder="0.00"
                      style={{ width: 100 }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-ui-fg-muted">₹</span>
                    <Input
                      value={variant.discountedPrice}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newVariants = [...formData.variants]
                        newVariants[idx].discountedPrice = e.target.value
                        setFormData({ ...formData, variants: newVariants })
                      }}
                      placeholder="0.00"
                      style={{ width: 100 }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {variant.price && variant.discountedPrice ? (
                    <div className="flex items-center gap-1">
                      <span className={clx(
                        "font-medium",
                        parseFloat(variant.discountedPrice) < parseFloat(variant.price) ? "text-emerald-500" : "text-ui-fg-muted"
                      )}>
                        {(() => {
                          const basePrice = parseFloat(variant.price)
                          const discountedPrice = parseFloat(variant.discountedPrice)
                          if (basePrice > 0 && discountedPrice < basePrice) {
                            const discount = ((basePrice - discountedPrice) / basePrice * 100).toFixed(1)
                            return `${discount}%`
                          }
                          return "—"
                        })()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ui-fg-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="bg-none border-none cursor-pointer text-ui-fg-muted"
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
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <button
            onClick={() => router.push("/products")}
            className="bg-none border-none cursor-pointer text-ui-fg-muted text-2xl mb-4"
          >
            ×
          </button>
          <Text size="small" className="text-ui-fg-muted">
            esc
          </Text>
        </div>

        {renderStepIndicator()}

        {currentStep === "details" && renderDetailsStep()}
        {currentStep === "organize" && renderOrganizeStep()}
        {currentStep === "variants" && renderVariantsStep()}

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-ui-border-base">
          {currentStep !== "details" && (
            <Button variant="secondary" onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}

          {currentStep !== "variants" ? (
            <Button
              variant="primary"
              onClick={handleNext}
              disabled={!formData.title}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={loading}
              disabled={loading}
            >
              Publish Product
            </Button>
          )}
        </div>
      </div>
    </VendorShell>
  )
}

export default VendorProductNewPage
