import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const productModuleService = req.scope.resolve(Modules.PRODUCT)

    // Update product to approved status
    const updatedProduct = await productModuleService.updateProducts(id, {
      status: ProductStatus.PUBLISHED,
      metadata: {
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: "admin", // You can get actual admin ID from session
      },
    })

    return res.json({ product: updatedProduct })
  } catch (error) {
    console.error("Error approving product:", error)
    return res.status(500).json({
      message: "Failed to approve product",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

