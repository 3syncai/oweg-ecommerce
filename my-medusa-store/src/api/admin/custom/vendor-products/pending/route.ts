import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest<any>, res: MedusaResponse) => {
  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // Get all products
    const allProducts = await productModuleService.listProducts({})

    // Filter products with pending approval status
    const pendingProducts = allProducts.filter((p: any) => {
      const metadata = p.metadata || {}
      return metadata.approval_status === "pending"
    })

    return res.json({ products: pendingProducts })
  } catch (error) {
    console.error("Error fetching pending products:", error)
    return res.status(500).json({
      message: "Failed to fetch pending products",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

