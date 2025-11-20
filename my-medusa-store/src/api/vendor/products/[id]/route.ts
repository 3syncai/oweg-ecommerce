import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { requireApprovedVendor } from "../../_lib/guards"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const productId = req.params?.id as string
  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const product = await productModuleService.retrieveProduct(productId)

    // Verify product belongs to vendor
    const metadata = (product as any).metadata || {}
    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    return res.json({ product })
  } catch (error: any) {
    console.error("Vendor product retrieve error:", error)
    return res.status(500).json({ message: error?.message || "Failed to retrieve product" })
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const productId = req.params?.id as string
  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const product = await productModuleService.retrieveProduct(productId)

    // Verify product belongs to vendor
    const metadata = (product as any).metadata || {}
    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    const body = (req as any).body || {}
    const {
      title,
      description,
      handle,
      category_ids,
      images,
      status,
      weight,
    } = body

    // Update product using product service directly
    const updateData: any = {}
    if (title) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (handle !== undefined) updateData.handle = handle
    if (category_ids) updateData.category_ids = category_ids
    if (images) updateData.images = images
    if (status) updateData.status = status
    if (weight !== undefined) updateData.weight = weight
    
    // Preserve vendor_id in metadata
    updateData.metadata = {
      ...metadata,
      vendor_id: auth.vendor_id,
    }
    
    const updatedProduct = await productModuleService.updateProducts(productId, updateData)

    return res.json({ product: updatedProduct })
  } catch (error: any) {
    console.error("Vendor product update error:", error)
    return res.status(500).json({ message: error?.message || "Failed to update product" })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const productId = req.params?.id as string
  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const product = await productModuleService.retrieveProduct(productId)

    // Verify product belongs to vendor
    const metadata = (product as any).metadata || {}
    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    // Delete product (soft delete via status change or hard delete)
    await productModuleService.deleteProducts([productId])

    return res.json({ message: "Product deleted successfully" })
  } catch (error: any) {
    console.error("Vendor product delete error:", error)
    return res.status(500).json({ message: error?.message || "Failed to delete product" })
  }
}

