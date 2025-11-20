import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { requireApprovedVendor } from "../_lib/guards"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/core-flows"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // List all products - we'll filter by metadata client-side since Medusa v2
    // doesn't support metadata filtering directly in listProducts
    const products = await productModuleService.listProducts({})

    // Filter products by vendor_id in metadata
    const vendorProducts = products.filter((p: any) => {
      const metadata = p.metadata || {}
      return metadata.vendor_id === auth.vendor_id
    })

    return res.json({ products: vendorProducts })
  } catch (error: any) {
    console.error("Vendor products list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list products" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const body = (req as any).body || {}
    const {
      title,
      subtitle,
      description,
      handle,
      category_ids,
      collection_id,
      tags,
      images,
      options,
      variants,
      weight,
      shipping_profile_id,
      discountable,
    } = body

    if (!title) {
      return res.status(400).json({ message: "title is required" })
    }

    // Get default shipping profile if not provided
    let finalShippingProfileId = shipping_profile_id
    if (!finalShippingProfileId) {
      const fulfillmentModuleService = req.scope.resolve(Modules.FULFILLMENT)
      const profiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" })
      if (profiles && profiles.length > 0) {
        finalShippingProfileId = profiles[0].id
      }
    }

    // Medusa v2 REQUIRES: If variants exist, at least one product option MUST exist
    // Even for simple products with one variant, we need a default option
    let finalVariants = variants || []
    let finalOptions = options || []

    console.log("Received variants:", JSON.stringify(finalVariants, null, 2))
    console.log("Received options:", JSON.stringify(finalOptions, null, 2))

    // If no variants provided, create a default one
    if (finalVariants.length === 0) {
      finalVariants = [
        {
          title: "Default variant",
          prices: [],
        },
      ]
    }

    // CRITICAL FIX: Medusa v2 requires options when variants exist
    // If no options provided, automatically create a default option
    if (finalOptions.length === 0 && finalVariants.length > 0) {
      // Create default product option
      finalOptions = [
        {
          title: "Default",
          values: ["Default"],
        },
      ]

      // Update all variants to reference the default option
      finalVariants = finalVariants.map((v: any) => {
        const cleaned: any = {
          title: v.title || "Default variant",
        }

        // Preserve existing fields
        if (v.sku && typeof v.sku === "string" && v.sku.trim()) {
          cleaned.sku = v.sku.trim()
        }

        if (v.prices && Array.isArray(v.prices) && v.prices.length > 0) {
          cleaned.prices = v.prices.filter((p: any) => p && p.amount && p.currency_code)
        } else {
          cleaned.prices = []
        }

        if (typeof v.manage_inventory === "boolean") {
          cleaned.manage_inventory = v.manage_inventory
        }

        if (typeof v.allow_backorder === "boolean") {
          cleaned.allow_backorder = v.allow_backorder
        }

        if (typeof v.inventory_quantity === "number") {
          cleaned.inventory_quantity = v.inventory_quantity
        }

        // CRITICAL: Medusa v2 expects option_values, NOT options
        // Using 'options' causes Medusa to merge with prices and corrupt the data
        cleaned.option_values = [
          {
            value: "Default",
          },
        ]

        return cleaned
      })
    }

    // CRITICAL: Convert any existing 'options' to 'option_values' for all variants
    // Medusa v2 internally merges 'options' with 'prices', causing corruption
    finalVariants = finalVariants.map((v: any) => {
      // If variant has 'options', convert to 'option_values' and remove 'options'
      if (v.options && Array.isArray(v.options)) {
        const cleaned: any = { ...v }
        cleaned.option_values = v.options.map((opt: any) => {
          // Handle both { value: "..." } and string formats
          if (typeof opt === "string") {
            return { value: opt }
          }
          if (typeof opt === "object" && opt.value) {
            return { value: opt.value }
          }
          return null
        }).filter((opt: any) => opt !== null)
        delete cleaned.options
        return cleaned
      }
      // If variant already has 'option_values', keep it
      return v
    })

    console.log("Final options:", JSON.stringify(finalOptions, null, 2))
    console.log("Final variants:", JSON.stringify(finalVariants, null, 2))

    // Normalize tags - Medusa expects array of objects with 'value' property
    let normalizedTags: Array<{ value: string }> = []
    if (tags && Array.isArray(tags)) {
      normalizedTags = tags
        .map((tag: any) => {
          // If tag is already an object with 'value', use it
          if (typeof tag === "object" && tag.value) {
            return { value: tag.value }
          }
          // If tag is a string, convert to object
          if (typeof tag === "string") {
            return { value: tag.trim() }
          }
          // Skip invalid tags
          return null
        })
        .filter((tag): tag is { value: string } => tag !== null)
    }

    // Normalize category_ids - ensure it's an array of strings
    let normalizedCategoryIds: string[] = []
    if (category_ids && Array.isArray(category_ids)) {
      normalizedCategoryIds = category_ids.filter((id: any) => id && typeof id === "string")
    }

    // Normalize collection_id - convert empty string to undefined (Medusa expects undefined, not null)
    const normalizedCollectionId = collection_id && typeof collection_id === "string" && collection_id.trim() 
      ? collection_id.trim() 
      : undefined

    // Normalize images - ensure they're objects with 'url' property
    let normalizedImages: Array<{ url: string }> = []
    if (images && Array.isArray(images)) {
      normalizedImages = images
        .map((img: any) => {
          if (typeof img === "string") {
            return { url: img }
          }
          if (typeof img === "object" && img.url) {
            return { url: img.url }
          }
          return null
        })
        .filter((img): img is { url: string } => img !== null)
    }

    // Prepare product data
    const productData = {
            title,
      subtitle: subtitle || null,
            description: description || null,
            handle: handle || null,
      is_giftcard: false,
      discountable: discountable !== false,
      category_ids: normalizedCategoryIds,
      collection_id: normalizedCollectionId,
      tags: normalizedTags,
      images: normalizedImages,
      options: finalOptions,
      variants: finalVariants,
            weight: weight || null,
      status: ProductStatus.DRAFT, // Set to DRAFT, pending admin approval
            shipping_profile_id: finalShippingProfileId,
            metadata: {
              vendor_id: auth.vendor_id,
        approval_status: "pending", // Custom status for admin approval
        submitted_at: new Date().toISOString(),
          },
    }

    console.log("Creating product with data:", JSON.stringify({
      ...productData,
      variants: productData.variants.map((v: any) => ({
        ...v,
        prices: v.prices,
      })),
    }, null, 2))

    // Create product using workflow with PENDING status for admin approval
    const { result } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [productData],
      },
    })

    const product = result[0]
    return res.json({ product })
  } catch (error: any) {
    console.error("Vendor product create error:", error)
    console.error("Error stack:", error?.stack)
    console.error("Error details:", {
      message: error?.message,
      type: error?.type,
      code: error?.code,
      name: error?.name,
    })
    return res.status(500).json({ 
      message: error?.message || "Failed to create product",
      error: error?.type || "unknown_error",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    })
  }
}

