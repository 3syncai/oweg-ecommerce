"use client"

import React, { useState, useEffect, useRef } from "react"
import { Heading, Text, Button, Input, Textarea, Label, Switch, toast } from "@medusajs/ui"
import { CheckCircleSolid, CircleMiniSolid } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import { useRouter } from "next/navigation"
import { vendorProductsApi, vendorCategoriesApi, vendorCollectionsApi } from "@/lib/api/client"
import axios from "axios"

type UploadedImage = {
  url: string
  key: string
  filename: string
  originalName: string
  isThumbnail?: boolean
}

type ProductFormData = {
  // Details
  title: string
  subtitle: string
  handle: string
  description: string
  media: File[]
  uploadedImages: UploadedImage[]
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
    thumbnailUrl: null,
    hasVariants: false,
    height: "",
    width: "",
    length: "",
    weight: "",
    midCode: "",
    hsCode: "",
    countryOfOrigin: "",
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
  
  const [uploadingImages, setUploadingImages] = useState(false)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
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
      await uploadImagesToS3(files)
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
      
      // If this is the first image, set it as thumbnail
      const shouldSetThumbnail = formData.uploadedImages.length === 0 && newImages.length > 0
      
      setFormData({
        ...formData,
        uploadedImages: [...formData.uploadedImages, ...newImages],
        thumbnailUrl: shouldSetThumbnail ? newImages[0].url : formData.thumbnailUrl,
      })
      
      toast.success("Success", { description: `${newImages.length} image(s) uploaded` })
    } catch (error: any) {
      console.error("Upload error:", error)
      toast.error("Error", { description: error?.message || "Failed to upload images" })
    } finally {
      setUploadingImages(false)
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
      await uploadImagesToS3(files)
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
          // Additional attributes in metadata
          mid_code: formData.midCode || null,
          hs_code: formData.hsCode || null,
          country_of_origin: formData.countryOfOrigin || null,
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, subtitle: e.target.value })}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, handle: e.target.value })}
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
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
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
        {uploadingImages && (
          <div style={{ marginTop: 16, padding: 12, background: "var(--bg-subtle)", borderRadius: 6 }}>
            <Text size="small" style={{ color: "var(--fg-muted)" }}>Uploading images...</Text>
          </div>
        )}
        {formData.uploadedImages.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: 8,
              background: "var(--bg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: 8,
              padding: 12,
            }}>
              {formData.uploadedImages.map((image, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    background: image.url === formData.thumbnailUrl ? "var(--bg-subtle)" : "transparent",
                    border: image.url === formData.thumbnailUrl ? "1px solid var(--border-accent)" : "1px solid transparent",
                    borderRadius: 6,
                    position: "relative",
                  }}
                >
                  {/* Drag handle */}
                  <div
                    style={{
                      cursor: "grab",
                      color: "var(--fg-muted)",
                      fontSize: 18,
                      padding: "4px 8px",
                    }}
                    title="Drag to reorder"
                  >
                    ⋮⋮
                  </div>
                  
                  {/* Image thumbnail */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 4,
                      overflow: "hidden",
                      background: "var(--bg-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={image.url}
                      alt={image.originalName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </div>
                  
                  {/* File info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="small" weight="plus" style={{ display: "block", marginBottom: 4 }}>
                      {image.originalName}
                    </Text>
                    <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
                      {image.filename}
                    </Text>
                    {image.url === formData.thumbnailUrl && (
                      <div style={{ marginTop: 4 }}>
                        <Text size="xsmall" style={{ 
                          color: "var(--fg-accent)",
                          background: "var(--bg-accent)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          display: "inline-block",
                        }}>
                          Thumbnail
                        </Text>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setOpenMenuIndex(openMenuIndex === idx ? null : idx)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                        color: "var(--fg-muted)",
                        fontSize: 18,
                        lineHeight: 1,
                      }}
                    >
                      ⋮
                    </button>
                    
                    {/* Context menu */}
                    {openMenuIndex === idx && (
                      <div
                        ref={(el) => {
                          menuRefs.current[idx] = el
                        }}
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          marginTop: 4,
                          background: "var(--bg-base)",
                          border: "1px solid var(--border-base)",
                          borderRadius: 6,
                          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                          zIndex: 1000,
                          minWidth: 160,
                        }}
                      >
                        <button
                          onClick={() => handleMakeThumbnail(idx)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--fg-base)",
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--bg-subtle)"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent"
                          }}
                        >
                          <span>🎬</span>
                          <span>Make thumbnail</span>
                        </button>
                        <button
                          onClick={() => handleDeleteImage(idx)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--fg-destructive)",
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            borderTop: "1px solid var(--border-base)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--bg-subtle)"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent"
                          }}
                        >
                          <span>🗑️</span>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteImage(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 8px",
                      color: "var(--fg-muted)",
                      fontSize: 18,
                      lineHeight: 1,
                    }}
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
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Label>
            Attributes <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-muted)",
              padding: "4px 8px",
            }}
            title="Options"
          >
            ⋮
          </button>
        </div>
        
        <div style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-base)",
          borderRadius: 8,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "var(--border-base)",
          }}>
            {/* Height */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Height</Text>
              <Input
                value={formData.height}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, height: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* Width */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Width</Text>
              <Input
                value={formData.width}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, width: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* Length */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Length</Text>
              <Input
                value={formData.length}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, length: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* Weight */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Weight</Text>
              <Input
                value={formData.weight}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* MID code */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>MID code</Text>
              <Input
                value={formData.midCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, midCode: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* HS code */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>HS code</Text>
              <Input
                value={formData.hsCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, hsCode: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
            
            {/* Country of origin */}
            <div style={{
              padding: "12px 16px",
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              gridColumn: "1 / -1",
            }}>
              <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Country of origin</Text>
              <Input
                value={formData.countryOfOrigin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                placeholder="-"
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderOrganizeStep = () => (
    <div style={{ maxWidth: 1200 }}>
      <Heading level="h2" style={{ marginBottom: 16 }}>Organize</Heading>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "var(--bg-base)", borderRadius: 8, marginBottom: 24 }}>
        <Switch
          checked={formData.discountable}
          onCheckedChange={(checked: boolean) => setFormData({ ...formData, discountable: checked })}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, type: e.target.value })}
            placeholder="Select type"
          />
        </div>

        <div>
          <Label>
            Collection <span style={{ color: "var(--fg-muted)" }}>(Optional)</span>
          </Label>
          <select
            value={formData.collection}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, collection: e.target.value })}
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
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, tags: e.target.value.split(",").map((t: string) => t.trim()).filter((t: string) => t) })}
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, shippingProfile: e.target.value })}
          placeholder="Select shipping profile"
        />
      </div>

      <div>
        <div style={{ marginBottom: 8 }}>
          <Label>
            Sales channels <span style={{ color: "var(--fg-muted)" }}>(Fixed)</span>
          </Label>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            Sales channel is automatically set and cannot be modified. Products are assigned to the default sales channel.
          </Text>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {formData.salesChannels.map((channel, idx) => (
            <div
              key={idx}
              style={{
                padding: "6px 12px",
                background: "var(--bg-subtle-hover)",
                border: "1px solid var(--border-base)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: 0.7,
                cursor: "not-allowed",
              }}
            >
              <Text size="small">{channel}</Text>
            </div>
          ))}
        </div>
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

      {/* Sales Channels Section - Read Only */}
      <div style={{ marginBottom: 24, padding: 16, background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: 8 }}>
        <Label style={{ marginBottom: 8, display: "block" }}>
          Sales channels <span style={{ color: "var(--fg-muted)" }}>(Fixed)</span>
        </Label>
        <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 12, display: "block" }}>
          Sales channel is automatically set and cannot be modified. Products are assigned to the default sales channel.
        </Text>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {formData.salesChannels.map((channel, idx) => (
            <div
              key={idx}
              style={{
                padding: "6px 12px",
                background: "var(--bg-subtle-hover)",
                border: "1px solid var(--border-base)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: 0.7,
                cursor: "not-allowed",
              }}
            >
              <Text size="small">{channel}</Text>
            </div>
          ))}
        </div>
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
            onClick={() => router.push("/products")}
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
              onClick={() => router.push("/products")}
          >
            Cancel
          </Button>
        </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="secondary" onClick={() => toast.info("Draft saved")}>
              Save as draft
            </Button>
            {currentStep === "variants" ? (
              <Button variant="primary" onClick={handleSubmit} disabled={loading}>
                {loading ? "Publishing..." : "Publish"}
              </Button>
            ) : (
              <Button variant="primary" onClick={handleNext}>
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

