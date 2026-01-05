import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/core-flows"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
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
  setCorsHeaders(res)
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
      thumbnail,
      options,
      variants,
      weight,
      height,
      width,
      length,
      shipping_profile_id,
      discountable,
      metadata,
    } = body

    if (!title) {
      return res.status(400).json({ message: "title is required" })
    }

    // Check brand authorization before proceeding
    // Extract brand from metadata (or use "UNBRANDED" if not provided)
    const brandName = (metadata?.brand || "UNBRANDED").toString().trim()

    try {
      const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any
      const hasAuthorization = await brandAuthService.checkBrandAuthorization(
        auth.vendor_id,
        brandName
      )

      if (!hasAuthorization) {
        return res.status(400).json({
          error: "brand_authorization_required",
          message: `Please upload brand authorization letter for "${brandName}" before creating products`,
          brand_name: brandName,
        })
      }
    } catch (brandAuthError: any) {
      console.error("Brand authorization check error:", brandAuthError)
      // If brand auth module is not available, log warning but continue
      // This allows gradual rollout
      console.warn("⚠️ Brand authorization module not available, skipping check")
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
    // Note: Default variant will have empty prices - vendor must provide variants with prices
    if (finalVariants.length === 0) {
      console.warn('⚠️ No variants provided - creating default variant with empty prices. Vendor should provide variants with prices.')
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
        // SKU is optional - if provided and conflicts, we'll handle it in error handling
        if (v.sku && typeof v.sku === "string" && v.sku.trim()) {
          cleaned.sku = v.sku.trim()
        }
        // If SKU is empty string, don't include it (Medusa treats empty string differently)
        else if (v.sku === "" || v.sku === null || v.sku === undefined) {
          // Don't set SKU - let Medusa auto-generate or leave it empty
        }

        // Process prices: separate base prices from price list prices
        if (v.prices && Array.isArray(v.prices) && v.prices.length > 0) {
          const allPrices = v.prices
            .map((p: any) => {
              // Ensure price has amount and currency_code
              if (!p || typeof p !== 'object') return null

              // Convert amount to number if it's a string
              let amount = p.amount
              if (typeof amount === 'string') {
                amount = parseFloat(amount)
              }

              // Ensure amount is a valid number
              if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
                return null
              }

              // Ensure currency_code exists, default to 'inr'
              const currency_code = p.currency_code || 'inr'

              return {
                amount: Math.round(amount), // Ensure integer (paise/cents)
                currency_code: currency_code.toLowerCase(),
                price_list_id: p.price_list_id || null
              }
            })
            .filter((p: any) => p !== null)

          // Separate base prices (no price_list_id) from price list prices
          cleaned.prices = allPrices
            .filter((p: any) => !p.price_list_id)
            .map((p: any) => ({
              amount: p.amount,
              currency_code: p.currency_code
            }))

          // Store price list prices separately for later (we'll add them after product creation)
          const priceListPrices = allPrices.filter((p: any) => p.price_list_id)
          if (priceListPrices.length > 0) {
            // Store in variant's metadata temporarily so we can access it after creation
            if (!cleaned.metadata) cleaned.metadata = {}
            cleaned.metadata._price_list_prices = priceListPrices
          }

          // If no valid prices after filtering, log a warning
          if (cleaned.prices.length === 0 && v.prices.length > 0) {
            console.warn('⚠️ No valid base prices found for variant:', v.title, 'Original prices:', v.prices)
          }
        } else {
          cleaned.prices = []
          // Log warning if variant has no prices
          if (v.title) {
            console.warn('⚠️ Variant has no prices:', v.title)
          }
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

        // CRITICAL: Medusa v2 expects option_values with option reference
        // The option_value must reference the product option by title
        cleaned.options = {
          Default: "Default"
        }

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

    // Handle tags - Medusa v2 requires tag IDs, not values
    // We need to find existing tags or create new ones, then use their IDs
    let normalizedTags: Array<{ id: string }> = []
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const productModuleService = req.scope.resolve(Modules.PRODUCT)

      // Separate tags with IDs from tags with values
      const tagsWithIds: Array<{ id: string }> = []
      const tagValues: string[] = []

      for (const tag of tags) {
        if (typeof tag === "object" && tag.id) {
          // Tag already has an ID, use it directly
          tagsWithIds.push({ id: tag.id })
        } else if (typeof tag === "object" && tag.value) {
          tagValues.push(tag.value.trim())
        } else if (typeof tag === "string") {
          tagValues.push(tag.trim())
        }
      }

      // For tags with values, find or create them
      if (tagValues.length > 0) {
        try {
          // Try to list existing tags - method name may vary
          let existingTags: any[] = []
          try {
            // Try different possible method names
            if (typeof (productModuleService as any).listProductTags === "function") {
              existingTags = await (productModuleService as any).listProductTags({})
            } else if (typeof (productModuleService as any).listTags === "function") {
              existingTags = await (productModuleService as any).listTags({})
            } else if (typeof (productModuleService as any).list === "function") {
              // Some services use generic list method
              existingTags = await (productModuleService as any).list({})
            }
          } catch (listError: any) {
            console.warn("Could not list existing tags:", listError?.message)
          }

          // Create a map of tag values to IDs (case-insensitive)
          const tagValueToId = new Map<string, string>()
          if (Array.isArray(existingTags)) {
            existingTags.forEach((tag: any) => {
              if (tag.value && tag.id) {
                tagValueToId.set(tag.value.toLowerCase().trim(), tag.id)
              }
            })
          }

          // Find or create tags
          for (const tagValue of tagValues) {
            if (!tagValue) continue

            const normalizedValue = tagValue.toLowerCase().trim()
            let tagId = tagValueToId.get(normalizedValue)

            // If tag doesn't exist, try to create it
            if (!tagId) {
              try {
                let newTag: any = null
                // Try different possible method names for creating tags
                if (typeof (productModuleService as any).createProductTags === "function") {
                  const created = await (productModuleService as any).createProductTags([{ value: tagValue }])
                  newTag = created?.[0]
                } else if (typeof (productModuleService as any).createTags === "function") {
                  const created = await (productModuleService as any).createTags([{ value: tagValue }])
                  newTag = created?.[0]
                } else if (typeof (productModuleService as any).create === "function") {
                  const created = await (productModuleService as any).create([{ value: tagValue }])
                  newTag = created?.[0]
                }

                if (newTag?.id) {
                  tagId = newTag.id
                  tagValueToId.set(normalizedValue, newTag.id) // Use newTag.id directly to be safe
                }
              } catch (createError: any) {
                console.warn(`Failed to create tag "${tagValue}":`, createError?.message)
                // Continue with other tags - don't fail product creation
              }
            }

            if (tagId) {
              normalizedTags.push({ id: tagId })
            }
          }
        } catch (tagError: any) {
          console.warn("Error processing tags:", tagError?.message)
          // If tag processing fails, continue without tags rather than failing product creation
        }
      }

      // Combine tags with IDs and newly created/found tags
      normalizedTags = [...tagsWithIds, ...normalizedTags]

      console.log(`Processed ${normalizedTags.length} tag(s) for product creation`)

      // If no tags were successfully processed, set to empty array to avoid errors
      if (normalizedTags.length === 0) {
        normalizedTags = []
      }
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

    // Prepare metadata - merge vendor metadata with user-provided metadata
    const baseMetadata: Record<string, any> = {
      vendor_id: auth.vendor_id,
      approval_status: "pending", // Custom status for admin approval
      submitted_at: new Date().toISOString(),
    }

    // Merge user-provided metadata (MID code, HS code, country of origin, etc.)
    if (metadata && typeof metadata === "object") {
      Object.assign(baseMetadata, metadata)
    }

    // Add videos to images array (same structure as images) for database storage
    // Videos will be stored in the database the same way as images
    const videosFromMetadata = baseMetadata?.videos
    if (videosFromMetadata && Array.isArray(videosFromMetadata)) {
      const videoImageObjects = videosFromMetadata
        .map((video: any) => {
          if (typeof video === "object" && video.url) {
            // Store video URL in images array (same structure as images)
            return { url: video.url }
          }
          if (typeof video === "string") {
            return { url: video }
          }
          return null
        })
        .filter((video): video is { url: string } => video !== null)

      // Add videos to the images array so they're stored in database the same way
      normalizedImages = [...normalizedImages, ...videoImageObjects]
      console.log(`Added ${videoImageObjects.length} video(s) to images array for database storage`)
    }

    // Generate handle from title if not provided
    // Handle must be unique, so we'll append a timestamp if it already exists
    const generateHandle = (title: string): string => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100)
    }

    let finalHandle = handle || generateHandle(title)

    // If handle is provided but might be duplicate, append timestamp to make it unique
    if (handle) {
      // Check if handle already exists by trying to find products with this handle
      try {
        const productModuleService = req.scope.resolve(Modules.PRODUCT)
        const existingProducts = await productModuleService.listProducts({
          handle: finalHandle,
        })

        if (existingProducts && existingProducts.length > 0) {
          // Handle exists, append timestamp to make it unique
          const timestamp = Date.now().toString().slice(-6) // Last 6 digits of timestamp
          finalHandle = `${finalHandle}-${timestamp}`
          console.log(`Handle "${handle}" already exists, using unique handle: "${finalHandle}"`)
        }
      } catch (checkError: any) {
        // If check fails, append timestamp anyway to be safe
        const timestamp = Date.now().toString().slice(-6)
        finalHandle = `${finalHandle}-${timestamp}`
        console.log(`Could not check handle uniqueness, using unique handle: "${finalHandle}"`)
      }
    } else {
      // No handle provided, generate from title and append timestamp for uniqueness
      const timestamp = Date.now().toString().slice(-6)
      finalHandle = `${finalHandle}-${timestamp}`
    }

    // Prepare product data
    const productData = {
      title,
      subtitle: subtitle || null,
      description: description || null,
      handle: finalHandle,
      thumbnail: thumbnail || (normalizedImages.length > 0 ? normalizedImages[0].url : null),
      is_giftcard: false,
      discountable: discountable !== false,
      category_ids: normalizedCategoryIds,
      collection_id: normalizedCollectionId,
      tags: normalizedTags,
      images: normalizedImages,
      options: finalOptions,
      variants: finalVariants,
      // Physical attributes
      weight: weight || null,
      height: height || null,
      width: width || null,
      length: length || null,
      status: ProductStatus.DRAFT, // Set to DRAFT, pending admin approval
      shipping_profile_id: finalShippingProfileId,
      metadata: baseMetadata,
    }

    // Log product data with detailed price information
    console.log("Creating product with data:", JSON.stringify({
      ...productData,
      variants: productData.variants.map((v: any) => ({
        ...v,
        prices: v.prices,
        priceCount: v.prices?.length || 0,
        hasPrices: (v.prices?.length || 0) > 0,
      })),
    }, null, 2))

    // Validate that at least one variant has prices
    const hasAnyPrices = productData.variants.some((v: any) =>
      v.prices && Array.isArray(v.prices) && v.prices.length > 0
    )

    if (!hasAnyPrices) {
      console.warn('⚠️ WARNING: Product has no prices! All variants have empty prices array.')
    }

    // Create product using workflow with PENDING status for admin approval
    const { result } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [productData],
      },
    })

    const product = result[0]

    // Link product to default sales channel
    try {
      const salesChannelModuleService = req.scope.resolve(Modules.SALES_CHANNEL)
      const defaultSalesChannels = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
      })

      if (defaultSalesChannels && defaultSalesChannels.length > 0) {
        const defaultSalesChannel = defaultSalesChannels[0]
        const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as any

        // Link product to sales channel using Medusa v2 link module
        // Format: { [module1]: { id_field: id }, [module2]: { id_field: id } }
        await linkModule.create({
          [Modules.PRODUCT]: {
            product_id: product.id,
          },
          [Modules.SALES_CHANNEL]: {
            sales_channel_id: defaultSalesChannel.id,
          },
        })

        console.log(`✅ Linked product ${product.id} to default sales channel ${defaultSalesChannel.id}`)
      } else {
        console.warn(`⚠️ Default sales channel not found`)
      }
    } catch (salesChannelError: any) {
      console.error(`❌ Failed to link product to sales channel:`, salesChannelError?.message)
      // Don't fail product creation if sales channel linking fails, but log the error
    }

    // Add discounted prices to price lists after product creation
    try {
      const pricingModule = req.scope.resolve(Modules.PRICING)
      const query = req.scope.resolve("query")

      // Check if any variants have price list prices stored in metadata
      for (let i = 0; i < product.variants.length; i++) {
        const variant = product.variants[i]
        const priceListPrices = variant.metadata?._price_list_prices

        if (priceListPrices && Array.isArray(priceListPrices) && priceListPrices.length > 0) {
          console.log(`🔍 Found ${priceListPrices.length} price list prices for variant ${variant.id}`)

          // Get the variant's price_set_id
          const { data: variantData } = await query.graph({
            entity: "product_variant",
            fields: ["id", "price_set.id"],
            filters: { id: variant.id }
          })

          const priceSetId = variantData?.[0]?.price_set?.id
          if (!priceSetId) {
            console.error(`❌ No price_set_id found for variant ${variant.id}`)
            continue
          }

          // Group prices by price_list_id
          const pricesByList: Record<string, any[]> = {}
          for (const priceData of priceListPrices) {
            const priceListId = priceData.price_list_id
            if (!pricesByList[priceListId]) {
              pricesByList[priceListId] = []
            }

            pricesByList[priceListId].push({
              currency_code: priceData.currency_code,
              amount: priceData.amount,
              price_set_id: priceSetId
            })
          }

          // Add prices to each price list using addPriceListPrices
          for (const [priceListId, prices] of Object.entries(pricesByList)) {
            try {
              await (pricingModule as any).addPriceListPrices([{
                price_list_id: priceListId,
                prices: prices
              }])

              console.log(`✅ Added ${prices.length} price(s) to price list ${priceListId} for variant ${variant.id}`)
            } catch (priceError: any) {
              console.error(`❌ Failed to add prices to price list ${priceListId}:`, priceError?.message)
            }
          }
        }
      }
    } catch (priceListError: any) {
      console.error(`❌ Failed to process price list prices:`, priceListError?.message)
      console.error(priceListError?.stack)
      // Don't fail product creation if price list processing fails
    }

    // Handle inventory management for variants
    try {
      const inventoryModule = req.scope.resolve(Modules.INVENTORY)
      const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

      // Get the default stock location (Default Warehouse)
      const stockLocations = await stockLocationModule.listStockLocations({
        name: "Default Warehouse"
      })

      let defaultLocation = stockLocations?.[0]

      // If no "Default Warehouse", try to get any stock location
      if (!defaultLocation) {
        const allLocations = await stockLocationModule.listStockLocations({})
        defaultLocation = allLocations?.[0]
        console.warn(`⚠️ "Default Warehouse" not found, using location: ${defaultLocation?.name}`)
      }

      if (defaultLocation) {
        console.log(`📦 Using stock location: ${defaultLocation.name} (${defaultLocation.id})`)

        // Get the original variant data to retrieve inventory quantities
        const originalVariants = variants || []

        // Process each variant's inventory
        for (let i = 0; i < product.variants.length; i++) {
          const variant = product.variants[i]
          const originalVariant = originalVariants[i] || {}

          // Check if this variant should manage inventory and has a quantity
          const manageInventory = originalVariant.manage_inventory !== false // Default to true
          const inventoryQuantity = typeof originalVariant.inventory_quantity === 'number'
            ? originalVariant.inventory_quantity
            : 0

          if (manageInventory && variant.id) {
            try {
              let inventoryItem

              // Check if inventory item already exists with this SKU
              if (variant.sku) {
                const existingItems = await inventoryModule.listInventoryItems({
                  sku: variant.sku
                })
                inventoryItem = existingItems?.[0]
              }

              // Create new inventory item if doesn't exist
              if (!inventoryItem) {
                const inventoryItems = await inventoryModule.createInventoryItems([{
                  sku: variant.sku || undefined,
                }])
                inventoryItem = inventoryItems[0]
                console.log(`📦 Created inventory item ${inventoryItem.id} for variant ${variant.id}`)
              } else {
                console.log(`♻️ Using existing inventory item ${inventoryItem.id} for SKU ${variant.sku}`)
              }

              // Link inventory item to variant
              const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as any
              await linkModule.create({
                [Modules.PRODUCT]: {
                  variant_id: variant.id,
                },
                [Modules.INVENTORY]: {
                  inventory_item_id: inventoryItem.id,
                },
              })

              console.log(`🔗 Linked inventory item ${inventoryItem.id} to variant ${variant.id}`)

              // Create inventory level for the default location
              await inventoryModule.createInventoryLevels([{
                inventory_item_id: inventoryItem.id,
                location_id: defaultLocation.id,
                stocked_quantity: inventoryQuantity,
              }])

              console.log(`✅ Stocked ${inventoryQuantity} units for variant ${variant.id} at location ${defaultLocation.name}`)
            } catch (inventoryError: any) {
              console.error(`❌ Failed to create inventory for variant ${variant.id}:`, inventoryError?.message)
              // Continue with other variants even if one fails
            }
          } else {
            console.log(`⏭️ Skipping inventory for variant ${variant.id} (manage_inventory: ${manageInventory})`)
          }
        }
      } else {
        console.warn('⚠️ No stock location found - inventory will not be created')
      }
    } catch (inventoryError: any) {
      console.error(`❌ Failed to process inventory:`, inventoryError?.message)
      console.error(inventoryError?.stack)
      // Don't fail product creation if inventory processing fails
    }

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

    // Handle duplicate SKU error specifically
    if (error?.message && error.message.includes("already exists") && error.message.includes("sku")) {
      return res.status(400).json({
        message: "A product variant with this SKU already exists. Please use a different SKU or leave it empty.",
        error: "duplicate_sku",
        details: error?.message,
      })
    }

    // Handle duplicate handle error - return helpful message
    if (error?.message && error.message.includes("already exists") && error.message.includes("handle")) {
      return res.status(400).json({
        message: "A product with this handle already exists. The system will automatically generate a unique handle. Please try again.",
        error: "duplicate_handle",
        details: error?.message,
      })
    }

    return res.status(500).json({
      message: error?.message || "Failed to create product",
      error: error?.type || "unknown_error",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    })
  }
}

