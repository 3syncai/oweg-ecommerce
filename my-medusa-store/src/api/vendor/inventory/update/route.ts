import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { requireApprovedVendor } from "../../_lib/guards"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        // MANUAL CORS FIX
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4000')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
        res.setHeader('Access-Control-Allow-Credentials', 'true')

        const auth = await requireApprovedVendor(req, res)
        if (!auth) return

        const vendorId = auth.vendor_id

        const body = (req as any).body || {}
        const { variant_id, quantity } = body

        if (!variant_id || typeof quantity !== 'number') {
            return res.status(400).json({
                success: false,
                message: "variant_id and quantity are required"
            })
        }

        console.log(`📦 Updating inventory for variant ${variant_id} to ${quantity}`)

        // Verify the variant belongs to this vendor
        const query = req.scope.resolve("query")
        const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: ["id", "product.metadata"],
            filters: { id: variant_id }
        })

        if (!variants || variants.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Variant not found"
            })
        }

        const variant = variants[0]
        if (variant.product?.metadata?.vendor_id !== vendorId) {
            return res.status(403).json({
                success: false,
                message: "Forbidden - This product does not belong to you"
            })
        }

        // Get inventory item for this variant
        const { data: variantInventory } = await query.graph({
            entity: "product_variant",
            fields: [
                "id",
                "inventory_items.inventory_item_id",
            ],
            filters: { id: variant_id }
        })

        const inventoryItemId = variantInventory?.[0]?.inventory_items?.[0]?.inventory_item_id

        if (!inventoryItemId) {
            return res.status(404).json({
                success: false,
                message: "No inventory item found for this variant"
            })
        }

        // Get default warehouse
        const inventoryModule = req.scope.resolve(Modules.INVENTORY)
        const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

        const locations = await stockLocationModule.listStockLocations({
            name: "Default Warehouse"
        })
        const defaultLocation = locations?.[0]

        if (!defaultLocation) {
            return res.status(404).json({
                success: false,
                message: "Default Warehouse not found"
            })
        }

        // Get existing inventory level
        const levels = await inventoryModule.listInventoryLevels({
            inventory_item_id: inventoryItemId,
            location_id: defaultLocation.id
        })

        if (levels && levels.length > 0) {
            // Update existing level
            await inventoryModule.updateInventoryLevels([{
                inventory_item_id: inventoryItemId,
                location_id: defaultLocation.id,
                stocked_quantity: quantity
            }])
            console.log(`✅ Updated inventory level ${levels[0].id} to ${quantity}`)
        } else {
            // Create new level
            await inventoryModule.createInventoryLevels([{
                inventory_item_id: inventoryItemId,
                location_id: defaultLocation.id,
                stocked_quantity: quantity
            }])
            console.log(`✅ Created new inventory level with quantity ${quantity}`)
        }

        return res.json({
            success: true,
            message: "Inventory updated successfully",
            variant_id,
            quantity,
            location: defaultLocation.name
        })
    } catch (error: any) {
        console.error('Vendor inventory update error:', error)
        return res.status(500).json({
            success: false,
            message: "Failed to update inventory",
            error: error?.message || String(error)
        })
    }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4000')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    return res.status(200).end()
}
