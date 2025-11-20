import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { requireApprovedVendor } from "../_lib/guards"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const orderModuleService = req.scope.resolve(Modules.ORDER)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)

    // Get all vendor products
    const allProducts = await productModuleService.listProducts({})
    const vendorProducts = allProducts.filter((p: any) => {
      const metadata = p.metadata || {}
      return metadata.vendor_id === auth.vendor_id
    })
    const vendorProductIds = new Set(vendorProducts.map((p: any) => p.id))

    // List all orders
    const orders = await orderModuleService.listOrders({})

    // Filter orders that contain vendor's products
    const vendorOrders = orders.filter((order: any) => {
      const items = order.items || []
      return items.some((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIds.has(productId)
      })
    })

    return res.json({ orders: vendorOrders })
  } catch (error: any) {
    console.error("Vendor orders list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list orders" })
  }
}

