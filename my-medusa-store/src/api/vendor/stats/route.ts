import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { requireApprovedVendor } from "../_lib/guards"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const orderModuleService = req.scope.resolve(Modules.ORDER)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)

    // Get vendor products
    const allProducts = await productModuleService.listProducts({})
    const vendorProducts = allProducts.filter((p: any) => {
      const metadata = p.metadata || {}
      return metadata.vendor_id === auth.vendor_id
    })
    const vendorProductIds = new Set(vendorProducts.map((p: any) => p.id))

    // Get vendor orders
    const allOrders = await orderModuleService.listOrders({})
    const vendorOrders = allOrders.filter((order: any) => {
      const items = order.items || []
      return items.some((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIds.has(productId)
      })
    })

    // Calculate stats
    const totalProducts = vendorProducts.length
    const totalOrders = vendorOrders.length
    
    // Calculate total revenue (sum of order totals)
    let totalRevenue = 0
    vendorOrders.forEach((order: any) => {
      const total = order.total || 0
      if (typeof total === 'number') {
        totalRevenue += total
      } else if (total && typeof total === 'object' && total.amount) {
        totalRevenue += total.amount
      }
    })

    // Get recent orders (last 5)
    const recentOrders = vendorOrders
      .sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || 0).getTime()
        const dateB = new Date(b.created_at || 0).getTime()
        return dateB - dateA
      })
      .slice(0, 5)
      .map((order: any) => ({
        id: order.id,
        display_id: order.display_id || order.id,
        email: order.email,
        total: order.total,
        status: order.status,
        created_at: order.created_at,
      }))

    // Products by status
    const productsByStatus = {
      draft: vendorProducts.filter((p: any) => p.status === 'draft').length,
      published: vendorProducts.filter((p: any) => p.status === 'published').length,
    }

    return res.json({
      stats: {
        total_products: totalProducts,
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        products_by_status: productsByStatus,
        recent_orders: recentOrders,
      },
    })
  } catch (error: any) {
    console.error("Vendor stats error:", error)
    return res.status(500).json({ message: error?.message || "Failed to get stats" })
  }
}

