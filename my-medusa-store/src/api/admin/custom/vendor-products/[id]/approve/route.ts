import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const productModuleService = req.scope.resolve(Modules.PRODUCT)

    // Get existing product to preserve metadata
    const existingProduct = await productModuleService.retrieveProduct(id)
    const existingMetadata = (existingProduct as any).metadata || {}

    // Update product to approved status, merging with existing metadata
    const updatedProduct = await productModuleService.updateProducts(id, {
      status: ProductStatus.PUBLISHED,
      metadata: {
        ...existingMetadata,
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: "admin", // You can get actual admin ID from session
      },
    })

    // Ensure product is linked to default sales channel
    try {
      const salesChannelModuleService = req.scope.resolve(Modules.SALES_CHANNEL)
      const defaultSalesChannels = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
      })
      
      if (defaultSalesChannels && defaultSalesChannels.length > 0) {
        const defaultSalesChannel = defaultSalesChannels[0]
        const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as any
        
        // Try to create link (will fail gracefully if it already exists)
        try {
          await linkModule.create({
            [Modules.PRODUCT]: {
              product_id: id,
            },
            [Modules.SALES_CHANNEL]: {
              sales_channel_id: defaultSalesChannel.id,
            },
          })
          console.log(`✅ Linked product ${id} to default sales channel ${defaultSalesChannel.id} on approval`)
        } catch (createError: any) {
          // Link might already exist, which is fine
          if (createError?.message?.includes("already exists") || createError?.message?.includes("duplicate")) {
            console.log(`ℹ️ Product ${id} already linked to default sales channel`)
          } else {
            throw createError
          }
        }
      }
    } catch (linkError: any) {
      console.warn("⚠️ Failed to link product to sales channel on approval:", linkError?.message)
      // Don't fail approval if sales channel linking fails
    }

    return res.json({ product: updatedProduct })
  } catch (error) {
    console.error("Error approving product:", error)
    return res.status(500).json({
      message: "Failed to approve product",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

