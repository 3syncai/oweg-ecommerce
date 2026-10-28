import { ProductEditError, saveVendorProductEdit } from "../../../../lib/vendor-product-edit"
import { CatalogConflict, protectCatalogEdit, publicVariantSku, withCatalogLock } from "../../../../lib/catalog-identity"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import { Modules } from "@medusajs/framework/utils"
import client from "../../../../utils/opensearch"
import { PRODUCTS_INDEX } from "../../../../utils/search-index"
import {
  parseColorImagesFromMetadata,
  parsePrimaryVisualOptionFromMetadata,
} from "../../../../lib/variant-matrix"
import { fetchProductVariantMatrix, type ProductVariantMatrix } from "../../../../lib/vendor-product-variants"
import { releaseInventorySkusForProduct } from "../../../../lib/release-sku"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const productId = req.params?.id as string
  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const product = await productModuleService.retrieveProduct(productId, { relations: ["images", "categories", "collection"] })

    // Verify product belongs to vendor
    const metadata = (product as any).metadata || {}
    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    let variantSummary = null as
      | {
          id: string
          title: string | null
          sku: string | null
          price: number | null
          discounted_price: number | null
          discounted_price_list_id: string | null
          currency_code: string
        }
      | null

    try {
      const knex = req.scope.resolve("__pg_connection__") as any
      const firstVariant = await knex("product_variant")
        .where({ product_id: productId })
        .orderBy("created_at", "asc")
        .first("id", "title", "sku")

      if (firstVariant?.id) {
        const basePriceRow = await knex("product_variant_price_set as pvps")
          .leftJoin("price as p", "p.price_set_id", "pvps.price_set_id")
          .where("pvps.variant_id", firstVariant.id)
          .whereNull("p.price_list_id")
          .whereNull("p.deleted_at")
          .orderByRaw("CASE WHEN LOWER(p.currency_code) = 'inr' THEN 0 ELSE 1 END")
          .first("p.amount", "p.currency_code")

        const discountedPriceRow = await knex("product_variant_price_set as pvps")
          .leftJoin("price as p", "p.price_set_id", "pvps.price_set_id")
          .where("pvps.variant_id", firstVariant.id)
          .whereNotNull("p.price_list_id")
          .whereNull("p.deleted_at")
          .orderByRaw("CASE WHEN LOWER(p.currency_code) = 'inr' THEN 0 ELSE 1 END")
          .first("p.amount", "p.currency_code", "p.price_list_id")

        variantSummary = {
          id: firstVariant.id,
          title: firstVariant.title || null,
          sku: firstVariant.sku || null,
          price: basePriceRow?.amount != null ? Number(basePriceRow.amount) : null,
          discounted_price: discountedPriceRow?.amount != null ? Number(discountedPriceRow.amount) : null,
          discounted_price_list_id: discountedPriceRow?.price_list_id || null,
          currency_code: (basePriceRow?.currency_code || discountedPriceRow?.currency_code || "inr").toLowerCase(),
        }
      }
    } catch (variantReadError: any) {
      console.warn("Failed to fetch variant summary for vendor product:", variantReadError?.message)
    }

    let variantMatrix: ProductVariantMatrix | null = null
    try {
      variantMatrix = await fetchProductVariantMatrix(req, productId)
    } catch (matrixError: any) {
      console.warn("Failed to fetch variant matrix for vendor product:", matrixError?.message)
    }

    const colorImages = parseColorImagesFromMetadata(metadata)
    const primaryVisualOption = parsePrimaryVisualOptionFromMetadata(
      metadata,
      variantMatrix?.options.map((opt) => opt.title) || []
    )

    if (variantSummary) variantSummary.sku = publicVariantSku(product, { sku: variantSummary.sku })
    if (variantMatrix) for (const variant of variantMatrix.variants) variant.sku = publicVariantSku(product, variant)
    return res.json({
      product,
      atomic_edit_version: 1,
      variant_summary: variantSummary,
      variant_matrix: variantMatrix,
      color_images: colorImages,
      primary_visual_option: primaryVisualOption,
    })
  } catch (error: any) {
    if (error instanceof CatalogConflict) return res.status(409).json({ error: "catalog_sku_conflict", message: error.message })
    console.error("Vendor product retrieve error:", error)
    return res.status(500).json({ message: error?.message || "Failed to retrieve product" })
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return
  return withCatalogLock(req.scope, () => updateOffer(req, res, auth))
}

export async function updateOffer(req: MedusaRequest, res: MedusaResponse, auth: { vendor_id: string }, matrixResponse = false) {

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
    await protectCatalogEdit(req.scope, product, body)
    if (body.metadata?.brand && body.metadata.brand !== metadata.brand) {
      const allowed = await (req.scope.resolve("vendorBrandAuthorization") as any).checkBrandAuthorization(auth.vendor_id, body.metadata.brand)
      if (!allowed) return res.status(400).json({ error: "brand_authorization_required", message: "Brand authorization is required for this brand." })
    }
    const updatedProduct = await saveVendorProductEdit(req, productId, auth.vendor_id, body)

    // Product is moved to pending/draft after vendor edit; remove stale published doc from OpenSearch.
    try {
      await client.delete({
        index: PRODUCTS_INDEX,
        id: productId,
        refresh: true,
      })
    } catch (deleteError: any) {
      if (deleteError?.meta?.statusCode !== 404) {
        console.warn("Failed removing product from OpenSearch during vendor edit:", deleteError?.message)
      }
    }

    if (matrixResponse) {
      // A post-commit read failure must not report that the committed edit failed.
      const matrix = await fetchProductVariantMatrix(req, productId).catch(() => null)
      if (matrix) for (const variant of matrix.variants) variant.sku = publicVariantSku(updatedProduct, variant)
      return res.json({ product_id: productId, product: updatedProduct, variant_matrix: matrix, metadata: updatedProduct.metadata })
    }
    return res.json({ product: updatedProduct, variant_ids: body.variants?.map((row: { id: string }) => row.id), atomic_edit_version: 1 })
  } catch (error: any) {
    if (error instanceof CatalogConflict) return res.status(409).json({ error: "catalog_sku_conflict", message: error.message })
    if (error instanceof ProductEditError) return res.status(error.status).json({ message: error.message })
    if (error?.code === "23505") return res.status(409).json({ message: "SKU or product handle is already in use" })
    console.error("Vendor product update error:", error)
    return res.status(500).json({ message: error?.message || "Failed to update product" })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
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

    // Free inventory SKUs before soft-deleting the product. Variants cascade soft-delete
    // (SKU unique index ignores deleted_at), but inventory items do not — without this,
    // re-uploading the same SKU fails with duplicate_sku.
    try {
      const released = await releaseInventorySkusForProduct(req.scope, productId)
      if (released.length > 0) {
        console.log(
          `♻️ Released ${released.length} inventory item(s) for deleted product ${productId}`
        )
      }
    } catch (skuReleaseError: any) {
      console.warn(
        `Failed releasing inventory SKUs for product ${productId}:`,
        skuReleaseError?.message
      )
    }

    await productModuleService.deleteProducts([productId])

    try {
      await client.delete({
        index: PRODUCTS_INDEX,
        id: productId,
        refresh: true,
      })
    } catch (searchDeleteError: any) {
      if (searchDeleteError?.meta?.statusCode !== 404) {
        console.warn(
          "Failed removing product from OpenSearch during vendor delete:",
          searchDeleteError?.message
        )
      }
    }

    return res.json({ message: "Product deleted successfully" })
  } catch (error: any) {
    if (error instanceof CatalogConflict) return res.status(409).json({ error: "catalog_sku_conflict", message: error.message })
    console.error("Vendor product delete error:", error)
    return res.status(500).json({ message: error?.message || "Failed to delete product" })
  }
}

