import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { pendingProductPagination } from "../../../../../lib/pending-product-pagination"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  let pagination: { limit: number; offset: number }
  try { pagination = pendingProductPagination(req.query) }
  catch (error) { return res.status(400).json({ message: (error as Error).message }) }
  res.setHeader("Cache-Control", "no-store")
  try {
    const query = req.scope.resolve("query")
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)

    // Filter/page in Postgres BEFORE loading descriptions, metadata and relations.
    // The JSON predicate matches the original approval rule exactly.
    const pool = getSharedDbPool()
    const [total, page] = await Promise.all([
      pool.query(`SELECT count(*)::int AS count FROM product
        WHERE deleted_at IS NULL AND metadata->>'approval_status' = $1`, ["pending"]),
      pool.query(`SELECT id FROM product
        WHERE deleted_at IS NULL AND metadata->>'approval_status' = $1
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, ["pending", pagination.limit, pagination.offset]),
    ])
    const count = total.rows[0].count as number
    const ids = page.rows.map((row: { id: string }) => row.id)
    if (!ids.length) return res.json({ products: [], count, ...pagination })
    const { data: products } = await query.graph({
      entity: "product",
      filters: { id: ids },
      pagination: { take: pagination.limit },
      fields: [
        "id", "title", "subtitle", "description", "status",
        "thumbnail", "created_at", "height", "width", "length", "weight",
        "metadata",
        "categories.id", "categories.name", "categories.handle",
        "categories.parent_category_id",
        "collection.id", "collection.title", "collection.handle",
      ],
    })

    // A product could be approved/deleted while its page was loading.
    const byId = new Map(products.filter((p: any) => p.metadata?.approval_status === "pending").map((p: any) => [p.id, p]))
    const pendingProducts = ids.flatMap((id: string) => byId.has(id) ? [byId.get(id)] : [])
    const vendorIds = [...new Set(pendingProducts.map((p: any) => p.metadata?.vendor_id).filter((id: unknown): id is string => typeof id === "string" && !!id))] as string[]
    const vendors = vendorIds.length ? await vendorService.listVendors({ id: vendorIds }, {
      select: ["id", "name", "store_name", "email"], take: vendorIds.length,
    }) : []
    const vendorMap = new Map(vendors.map(v => [v.id, v]))

    // Enrich products with vendor information
    const productsWithVendor = pendingProducts.map((p: any) => {
      const metadata = p.metadata || {}
      const vendorId = metadata.vendor_id
      const vendor = vendorId ? vendorMap.get(vendorId) : null

      return {
        ...p,
        vendor: vendor ? {
          id: vendor.id,
          name: vendor.name,
          store_name: vendor.store_name,
          email: vendor.email,
        } : null,
      }
    })

    return res.json({ products: productsWithVendor, count, ...pagination })
  } catch (error) {
    console.error("Error fetching pending products:", error)
    return res.status(500).json({
      message: "Failed to fetch pending products",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

