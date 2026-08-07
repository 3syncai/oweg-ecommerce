import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { requireApprovedVendor } from "../_lib/guards"
import {
  parseVendorPagination,
  slicePage,
  paginationMeta,
} from "../../../lib/vendor-pagination"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.VENDOR_CORS || "http://localhost:4000"
    )
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-publishable-api-key"
    )
    res.setHeader("Access-Control-Allow-Credentials", "true")

    const auth = await requireApprovedVendor(req, res)
    if (!auth) return

    const vendorId = auth.vendor_id
    const pagination = parseVendorPagination(req, 50)
    const q = String(req.query?.q || "").trim().toLowerCase()

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
          vendor_id: vendorId,
        },
      },
    })

    if (!products || products.length === 0) {
      return res.json({
        success: true,
        inventory: [],
        message: "No products found",
        ...paginationMeta(0, pagination),
      })
    }

    const inventoryModule = req.scope.resolve(Modules.INVENTORY)
    const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

    const locations = await stockLocationModule.listStockLocations({
      name: "Default Warehouse",
    })
    const defaultLocation = locations?.[0]

    const variantIds = products.flatMap((p: any) =>
      (p.variants || []).map((v: any) => v.id).filter(Boolean)
    )

    const inventoryItemByVariant = new Map<string, string>()
    if (variantIds.length) {
      const { data: variantsWithInventory } = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "inventory_items.inventory_item_id",
          "inventory_items.inventory.id",
        ],
        filters: { id: variantIds },
      })
      for (const row of variantsWithInventory || []) {
        const itemId = row?.inventory_items?.[0]?.inventory_item_id
        if (row?.id && itemId) inventoryItemByVariant.set(row.id, itemId)
      }
    }

    const inventoryItemIds = Array.from(new Set(inventoryItemByVariant.values()))
    const levelByItemId = new Map<string, { id: string; stocked_quantity: number }>()
    if (inventoryItemIds.length && defaultLocation) {
      const levels = await inventoryModule.listInventoryLevels({
        inventory_item_id: inventoryItemIds,
        location_id: defaultLocation.id,
      } as any)
      for (const level of levels || []) {
        if (level?.inventory_item_id) {
          levelByItemId.set(String(level.inventory_item_id), {
            id: level.id,
            stocked_quantity: Number(level.stocked_quantity) || 0,
          })
        }
      }
    }

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
        const inventoryItemId = inventoryItemByVariant.get(variant.id) || null
        const level = inventoryItemId ? levelByItemId.get(inventoryItemId) : null
        inventoryData.push({
          product_id: product.id,
          product_title: product.title,
          product_thumbnail: product.thumbnail,
          variant_id: variant.id,
          variant_title: variant.title,
          variant_sku: variant.sku,
          inventory_item_id: inventoryItemId,
          inventory_level_id: level?.id || null,
          stock_quantity: level?.stocked_quantity || 0,
          location_id: defaultLocation?.id,
          location_name: level ? defaultLocation?.name || "Default Warehouse" : "No Location",
          manage_inventory: variant.manage_inventory !== false,
        })
      }
    }

    let filtered = inventoryData
    if (q) {
      filtered = inventoryData.filter((row) => {
        const hay = [row.product_title, row.variant_title, row.variant_sku, row.product_id]
          .map((v) => String(v || "").toLowerCase())
          .join(" ")
        return hay.includes(q)
      })
    }

    const total = filtered.length
    const page = slicePage(filtered, pagination)

    return res.json({
      success: true,
      inventory: page,
      total,
      ...paginationMeta(total, pagination),
    })
  } catch (error: any) {
    console.error("Vendor inventory fetch error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
      error: error?.message || String(error),
    })
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
  return res.status(200).end()
}
