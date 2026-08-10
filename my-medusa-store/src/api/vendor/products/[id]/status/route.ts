import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { requireApprovedVendor } from "../../../_lib/guards"
import client from "../../../../../utils/opensearch"
import {
  PRODUCTS_INDEX,
  buildSearchDocument,
  ensureProductsIndex,
} from "../../../../../utils/search-index"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * Vendor listing visibility control (does not re-run admin approval):
 * - draft: hide from storefront (status=draft), keep approval_status if already approved
 * - publish: show on storefront again only when approval_status === approved
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const productId = req.params?.id as string
  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  const body = ((req as any).body || {}) as { action?: string }
  const action = String(body.action || "")
    .trim()
    .toLowerCase()

  if (action !== "draft" && action !== "publish") {
    return res.status(400).json({
      message: 'action must be "draft" or "publish"',
    })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const product = await productModuleService.retrieveProduct(productId)
    const metadata = ((product as any).metadata || {}) as Record<string, any>

    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    const approvalStatus = String(metadata.approval_status || "").toLowerCase()
    const currentStatus = String((product as any).status || "").toLowerCase()
    const nowIso = new Date().toISOString()

    if (action === "draft") {
      if (currentStatus === "draft") {
        return res.json({
          product,
          message: "Product is already drafted / hidden from storefront",
        })
      }

      const updatedProduct = await productModuleService.updateProducts(productId, {
        status: ProductStatus.DRAFT,
        metadata: {
          ...metadata,
          vendor_id: auth.vendor_id,
          // Keep admin approval so vendor can re-publish without re-review
          approval_status: approvalStatus === "approved" ? "approved" : approvalStatus || null,
          vendor_listing_hidden_at: nowIso,
          vendor_listing_hidden_reason: "vendor_draft",
        },
      })

      try {
        await client.delete({
          index: PRODUCTS_INDEX,
          id: productId,
          refresh: true,
        })
      } catch (deleteError: any) {
        if (deleteError?.meta?.statusCode !== 404) {
          console.warn(
            "Failed removing product from OpenSearch during vendor draft:",
            deleteError?.message
          )
        }
      }

      return res.json({
        product: updatedProduct,
        message: "Product drafted. It is now hidden from the storefront.",
      })
    }

    // publish
    if (approvalStatus !== "approved") {
      return res.status(400).json({
        message:
          "Only admin-approved products can be published directly. Submit changes for approval first.",
        approval_status: approvalStatus || null,
      })
    }

    if (currentStatus === "published") {
      return res.json({
        product,
        message: "Product is already published / visible on storefront",
      })
    }

    const updatedProduct = await productModuleService.updateProducts(productId, {
      status: ProductStatus.PUBLISHED,
      metadata: {
        ...metadata,
        vendor_id: auth.vendor_id,
        approval_status: "approved",
        vendor_listing_hidden_at: null,
        vendor_listing_hidden_reason: null,
        vendor_relisted_at: nowIso,
      },
    })

    // Ensure default sales channel link (same as admin approve)
    try {
      const salesChannelModuleService = req.scope.resolve(Modules.SALES_CHANNEL)
      const defaultSalesChannels = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
      })

      if (defaultSalesChannels?.length) {
        const defaultSalesChannel = defaultSalesChannels[0]
        const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as any
        try {
          await linkModule.create({
            [Modules.PRODUCT]: { product_id: productId },
            [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel.id },
          })
        } catch (createError: any) {
          const msg = String(createError?.message || "")
          if (!msg.includes("already exists") && !msg.includes("duplicate")) {
            throw createError
          }
        }
      }
    } catch (linkError: any) {
      console.warn(
        "Failed to link product to sales channel on vendor publish:",
        linkError?.message
      )
    }

    try {
      const productService = req.scope.resolve("productService") as any
      const productForIndex = await productService.retrieve(productId, {
        relations: [
          "variants",
          "variants.prices",
          "variants.options",
          "collection",
          "categories",
          "tags",
        ],
      })

      await ensureProductsIndex()
      const doc = buildSearchDocument(productForIndex as Record<string, any>)
      await client.index({
        index: PRODUCTS_INDEX,
        id: productId,
        refresh: true,
        body: doc,
      })
    } catch (indexError: any) {
      console.error(
        "Failed to sync OpenSearch on vendor publish:",
        indexError?.message || indexError
      )
    }

    return res.json({
      product: updatedProduct,
      message: "Product published. It is now visible on the storefront.",
    })
  } catch (error: any) {
    console.error("Vendor product status error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to update product listing status",
    })
  }
}
