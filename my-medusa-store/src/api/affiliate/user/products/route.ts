import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { Client } from "pg"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
    const origin = req?.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res, req)
    return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res, req)

    try {
        const productModuleService = req.scope.resolve(Modules.PRODUCT)
        const query = req.scope.resolve("query")

        // Fetch all products - basic list
        const products = await productModuleService.listProducts({}) || []

        if (products.length === 0) {
            return res.json({
                products: [],
                allProducts: [],
                categories: []
            })
        }

        // Fetch all commissions from database
        const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
        let allCommissions: any[] = []
        try {
            allCommissions = await affiliateService.listAffiliateCommissions({}) || []
            console.log(`Loaded ${allCommissions.length} commission settings from database`)
        } catch (error: any) {
            console.log("Error fetching commissions:", error?.message)
            allCommissions = []
        }

        // Create commission maps for quick lookup
        const productCommissionMap = new Map<string, number>()
        const categoryCommissionMap = new Map<string, number>()
        const collectionCommissionMap = new Map<string, number>()

        allCommissions.forEach((comm: any) => {
            if (comm.product_id) {
                productCommissionMap.set(comm.product_id, comm.commission_rate)
            } else if (comm.category_id) {
                categoryCommissionMap.set(comm.category_id, comm.commission_rate)
            } else if (comm.collection_id) {
                collectionCommissionMap.set(comm.collection_id, comm.commission_rate)
            }
        })

        console.log(`Commission maps: ${productCommissionMap.size} products, ${categoryCommissionMap.size} categories, ${collectionCommissionMap.size} collections`)

        // Get pricing data directly from database using the correct structure
        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
            throw new Error("DATABASE_URL not configured")
        }

        const client = new Client({ connectionString: databaseUrl })
        await client.connect()

        // Use the exact SQL structure provided by the user
        const priceQuery = `
      SELECT
        p.id AS product_id,
        pv.id AS variant_id,
        base_p.amount AS base_price,
        disc_p.amount AS discounted_price
      FROM product p
      JOIN product_variant pv ON pv.product_id = p.id
      JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
      JOIN price_set ps ON ps.id = pvps.price_set_id
      LEFT JOIN price base_p 
        ON base_p.price_set_id = ps.id
        AND base_p.price_list_id IS NULL
        AND base_p.min_quantity IS NULL
        AND base_p.max_quantity IS NULL
      LEFT JOIN price disc_p
        ON disc_p.price_set_id = ps.id
        AND disc_p.price_list_id IS NOT NULL
        AND disc_p.min_quantity IS NULL
        AND disc_p.max_quantity IS NULL
      WHERE p.deleted_at IS NULL
        AND pv.deleted_at IS NULL
    `

        const priceResult = await client.query(priceQuery)
        await client.end()

        // Create a map of product -> price data
        const productPriceMap = new Map<string, { base: number, discounted: number | null }>()

        priceResult.rows.forEach((row: any) => {
            const productId = row.product_id
            const basePrice = Number(row.base_price) || 0
            const discountedPrice = row.discounted_price ? Number(row.discounted_price) : null

            if (!productPriceMap.has(productId)) {
                productPriceMap.set(productId, { base: basePrice, discounted: discountedPrice })
            }
        })

        console.log(`Loaded pricing for ${productPriceMap.size} products`)

        // Fetch variants for inventory
        let allVariants: any[] = []
        try {
            const { data: variantsData } = await query.graph({
                entity: "product_variant",
                fields: ["id", "product_id", "inventory_quantity"],
            })
            allVariants = variantsData || []
        } catch (e: any) {
            console.log("Could not fetch variants:", e?.message)
        }

        // Group variants by product_id
        const variantsByProduct = new Map<string, any[]>()
        allVariants.forEach((variant: any) => {
            if (variant.product_id) {
                const existing = variantsByProduct.get(variant.product_id) || []
                existing.push(variant)
                variantsByProduct.set(variant.product_id, existing)
            }
        })


        // Fetch inventory data properly
        const inventoryMap = new Map<string, { quantity: number }>()
        const variantIds = Array.from(variantsByProduct.values())
            .flat()
            .map(v => v.id)
            .filter(Boolean)

        if (variantIds.length > 0) {
            try {
                // Get inventory items and links
                const { data: inventoryItems } = await query.graph({
                    entity: "inventory_item",
                    fields: ["id", "sku"],
                })

                // Try to get variant-inventory links
                let variantInventoryLinks: any[] = []
                const linkTableNames = [
                    "product_variant_inventory_item",
                    "inventory_item_product_variant",
                ]

                for (const tableName of linkTableNames) {
                    try {
                        const { data: links } = await query.graph({
                            entity: tableName,
                            fields: ["variant_id", "inventory_item_id"],
                            filters: { variant_id: variantIds },
                        })
                        if (links && links.length > 0) {
                            variantInventoryLinks = links
                            break
                        }
                    } catch (e) {
                        continue
                    }
                }

                // Fallback: match by SKU
                if (variantInventoryLinks.length === 0 && inventoryItems) {
                    const variantSkuMap = new Map()
                    Array.from(variantsByProduct.values()).flat().forEach((v: any) => {
                        if (v.sku) variantSkuMap.set(v.sku, v.id)
                    })

                    inventoryItems.forEach((item: any) => {
                        if (item.sku && variantSkuMap.has(item.sku)) {
                            variantInventoryLinks.push({
                                variant_id: variantSkuMap.get(item.sku),
                                inventory_item_id: item.id,
                            })
                        }
                    })
                }

                if (variantInventoryLinks.length > 0) {
                    const inventoryItemIds = [...new Set(variantInventoryLinks.map((link: any) => link.inventory_item_id).filter(Boolean))]

                    // Get inventory levels
                    const { data: inventoryLevels } = await query.graph({
                        entity: "inventory_level",
                        fields: ["id", "inventory_item_id", "stocked_quantity", "reserved_quantity"],
                        filters: { inventory_item_id: inventoryItemIds },
                    })

                    // Create map of inventory_item_id -> total quantity
                    const itemQuantityMap = new Map()
                    if (inventoryLevels && Array.isArray(inventoryLevels)) {
                        inventoryLevels.forEach((level: any) => {
                            const itemId = level.inventory_item_id
                            const stocked = Number(level.stocked_quantity) || 0
                            const reserved = Number(level.reserved_quantity) || 0
                            const available = Math.max(0, stocked - reserved)

                            const existing = itemQuantityMap.get(itemId) || 0
                            itemQuantityMap.set(itemId, existing + available)
                        })
                    }

                    // Map to variants
                    variantInventoryLinks.forEach((link: any) => {
                        const variantId = link.variant_id
                        const itemId = link.inventory_item_id
                        if (variantId && itemId) {
                            const availableQuantity = itemQuantityMap.get(itemId) || 0
                            const existing = inventoryMap.get(variantId) || { quantity: 0 }
                            inventoryMap.set(variantId, {
                                quantity: existing.quantity + availableQuantity,
                            })
                        }
                    })
                }
            } catch (error: any) {
                console.log("Error fetching inventory:", error?.message)
            }
        }

        console.log(`Inventory map created with ${inventoryMap.size} variants having stock data`)

        // Process products with commission check
        const productsWithCommission = await Promise.all(
            products.map(async (product: any) => {
                try {
                    // Get price data
                    const priceData = productPriceMap.get(product.id)
                    if (!priceData) {
                        return null // No price data
                    }

                    // Use discounted price if available, otherwise base price
                    const price = priceData.discounted || priceData.base

                    if (price <= 0) {
                        return null // Invalid price
                    }

                    // Get inventory quantity properly from inventory_level table
                    const productVariants = variantsByProduct.get(product.id) || []
                    let inventoryQuantity = 0

                    // Calculate total inventory from inventory map
                    for (const variant of productVariants) {
                        const invData = inventoryMap.get(variant.id)
                        if (invData) {
                            inventoryQuantity += invData.quantity
                        }
                    }
                    // Get categories and collection
                    let categoryName = "Uncategorized"
                    let categoryNames: string[] = []
                    let categoryIds: string[] = []
                    let collectionId: string | null = null
                    let collectionTitle: string | null = null

                    try {
                        const fullProduct = await productModuleService.retrieveProduct(product.id, {
                            relations: ["categories", "collection"],
                        })

                        if (fullProduct.categories && fullProduct.categories.length > 0) {
                            categoryName = fullProduct.categories[0].name || "Uncategorized"
                            categoryNames = fullProduct.categories.map((c: any) => c.name || "Unknown")
                            categoryIds = fullProduct.categories.map((c: any) => c.id)
                        }

                        if (fullProduct.collection) {
                            collectionId = fullProduct.collection.id
                            collectionTitle = fullProduct.collection.title
                        }
                    } catch (e) {
                        // Use defaults if retrieval fails
                    }

                    // Determine commission (priority: product > collection > category)
                    let commissionRate: number | null = null
                    let commissionSource: string = "none"

                    if (productCommissionMap.has(product.id)) {
                        commissionRate = productCommissionMap.get(product.id)!
                        commissionSource = "product"
                    } else if (collectionId && collectionCommissionMap.has(collectionId)) {
                        commissionRate = collectionCommissionMap.get(collectionId)!
                        commissionSource = "collection"
                    } else if (categoryIds.length > 0) {
                        for (const catId of categoryIds) {
                            if (categoryCommissionMap.has(catId)) {
                                commissionRate = categoryCommissionMap.get(catId)!
                                commissionSource = "category"
                                break
                            }
                        }
                    }

                    // Only return products with commission
                    if (commissionRate === null) {
                        return null
                    }

                    // Calculate commission on the final price (discounted if available, else base)
                    const commissionAmount = (price * commissionRate) / 100

                    return {
                        id: product.id,
                        title: product.title,
                        description: product.description || "",
                        thumbnail: product.thumbnail,
                        price: price,
                        category: categoryName,
                        categories: categoryNames,
                        collection: collectionTitle,
                        isInStock: inventoryQuantity > 0,
                        inventoryQuantity: inventoryQuantity,
                        commissionRate: commissionRate,
                        commissionSource: commissionSource,
                        commissionAmount: commissionAmount,
                        hasCommission: true
                    }
                } catch (error: any) {
                    console.log(`Error processing product ${product.id}:`, error?.message)
                    return null
                }
            })
        )

        // Filter out nulls
        const validProducts = productsWithCommission.filter(p => p !== null) as any[]

        console.log(`Returning ${validProducts.length} products with commissions (out of ${products.length} total)`)

        // Get unique categories
        const categories = [...new Set(validProducts.map((p: any) => p.category))]

        return res.json({
            products: validProducts,
            allProducts: validProducts,
            categories: categories
        })

    } catch (error: any) {
        console.error("Error fetching products for affiliate:", error)
        return res.status(500).json({
            error: "Failed to fetch products",
            message: error.message
        })
    }
}
