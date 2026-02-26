import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { requireApprovedVendor } from "../_lib/guards"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        // MANUAL CORS FIX
        res.setHeader('Access-Control-Allow-Origin', process.env.VENDOR_CORS || 'http://localhost:4000')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
        res.setHeader('Access-Control-Allow-Credentials', 'true')

        const auth = await requireApprovedVendor(req, res)
        if (!auth) return

        const vendorId = auth.vendor_id

        console.log('📦 Fetching inventory for vendor:', vendorId)

        // Get all products for this vendor
        const query = req.scope.resolve("query")
        const { data: products } = await query.graph({
            entity: "product",
            fields: [
                "id",
                "title",
                "thumbnail",
                "status",
                "variants.id",
                "variants.title",
                "variants.sku",
                "variants.inventory_quantity",
                "variants.manage_inventory",
            ],
            filters: {
                metadata: {
                    vendor_id: vendorId
                }
            }
        })

        if (!products || products.length === 0) {
            return res.json({
                success: true,
                inventory: [],
                message: "No products found"
            })
        }

        // Get inventory module
        const inventoryModule = req.scope.resolve(Modules.INVENTORY)
        const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

        // Get Default Warehouse
        const locations = await stockLocationModule.listStockLocations({
            name: "Default Warehouse"
        })
        const defaultLocation = locations?.[0]

        // Build inventory data
        const inventoryData: Array<{
            product_id: string
            product_title: string
            product_thumbnail: string | null
            variant_id: string
            variant_title: string
            variant_sku: string | null
            inventory_item_id: string | null
            inventory_level_id: string | null
            stock_quantity: number
            location_id: string | undefined
            location_name: string
            manage_inventory: boolean
        }> = []

        for (const product of products) {
            for (const variant of product.variants || []) {
                try {
                    // Get inventory item for this variant
                    const { data: variantWithInventory } = await query.graph({
                        entity: "product_variant",
                        fields: [
                            "id",
                            "inventory_items.inventory_item_id",
                            "inventory_items.inventory.id",
                            "inventory_items.inventory.sku",
                        ],
                        filters: { id: variant.id }
                    })

                    const inventoryItemId = variantWithInventory?.[0]?.inventory_items?.[0]?.inventory_item_id

                    let stockQuantity = 0
                    let locationName = "No Location"
                    let inventoryLevelId: string | null = null

                    if (inventoryItemId && defaultLocation) {
                        // Get inventory level
                        const levels = await inventoryModule.listInventoryLevels({
                            inventory_item_id: inventoryItemId,
                            location_id: defaultLocation.id
                        })

                        if (levels && levels.length > 0) {
                            stockQuantity = levels[0].stocked_quantity || 0
                            locationName = defaultLocation.name
                            inventoryLevelId = levels[0].id
                        }
                    }

                    inventoryData.push({
                        product_id: product.id,
                        product_title: product.title,
                        product_thumbnail: product.thumbnail,
                        variant_id: variant.id,
                        variant_title: variant.title,
                        variant_sku: variant.sku,
                        inventory_item_id: inventoryItemId || null,
                        inventory_level_id: inventoryLevelId,
                        stock_quantity: stockQuantity,
                        location_id: defaultLocation?.id,
                        location_name: locationName,
                        manage_inventory: variant.manage_inventory !== false,
                    })
                } catch (error: any) {
                    console.error(`Error processing variant ${variant.id}:`, error?.message)
                }
            }
        }

        console.log(`✅ Found ${inventoryData.length} inventory items`)

        return res.json({
            success: true,
            inventory: inventoryData,
            total: inventoryData.length
        })
    } catch (error: any) {
        console.error('Vendor inventory fetch error:', error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch inventory",
            error: error?.message || String(error)
        })
    }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
    res.setHeader('Access-Control-Allow-Origin', process.env.VENDOR_CORS || 'http://localhost:4000')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    return res.status(200).end()
}
