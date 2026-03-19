import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import client from "../../../../../../utils/opensearch"
import { PRODUCTS_INDEX } from "../../../../../../utils/search-index"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const productModuleService = req.scope.resolve(Modules.PRODUCT)

    // Get existing product to preserve metadata
    const existingProduct = await productModuleService.retrieveProduct(id)
    const existingMetadata = (existingProduct as any).metadata || {}

    // Update product to rejected status, merging with existing metadata
    const updatedProduct = await productModuleService.updateProducts(id, {
      status: ProductStatus.REJECTED,
      metadata: {
        ...existingMetadata,
        approval_status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by: "admin", // You can get actual admin ID from session
      },
    })

    // Remove from OpenSearch immediately on reject
    try {
      await client.delete({
        index: PRODUCTS_INDEX,
        id,
        refresh: true,
      })
      console.log(`🗑️ OpenSearch document removed on reject for product ${id}`)
    } catch (deleteError: any) {
      if (deleteError?.meta?.statusCode !== 404) {
        console.error("❌ Failed removing product from OpenSearch on reject:", deleteError?.message || deleteError)
      }
    }

    return res.json({ product: updatedProduct })
  } catch (error) {
    console.error("Error rejecting product:", error)
    return res.status(500).json({
      message: "Failed to reject product",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

