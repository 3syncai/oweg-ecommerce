import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import client from "../../../../utils/opensearch"
import { PRODUCTS_INDEX } from "../../../../utils/search-index"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
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
    const product = await productModuleService.retrieveProduct(productId)

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
          .orderByRaw("CASE WHEN LOWER(p.currency_code) = 'inr' THEN 0 ELSE 1 END")
          .first("p.amount", "p.currency_code")

        const discountedPriceRow = await knex("product_variant_price_set as pvps")
          .leftJoin("price as p", "p.price_set_id", "pvps.price_set_id")
          .where("pvps.variant_id", firstVariant.id)
          .whereNotNull("p.price_list_id")
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

    return res.json({ product, variant_summary: variantSummary })
  } catch (error: any) {
    console.error("Vendor product retrieve error:", error)
    return res.status(500).json({ message: error?.message || "Failed to retrieve product" })
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
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

    const body = (req as any).body || {}
    const {
      title,
      description,
      handle,
      category_ids,
      collection_id,
      images,
      weight,
      price,
      discounted_price,
      vendor_edit_remark,
      metadata: requestMetadata,
    } = body

    const hasPriceUpdate = price !== undefined && price !== null && `${price}`.toString().trim() !== ""
    const hasDiscountedPriceUpdate =
      discounted_price !== undefined &&
      discounted_price !== null &&
      `${discounted_price}`.toString().trim() !== ""

    const parsedPrice = hasPriceUpdate ? Number(price) : null
    const parsedDiscountedPrice = hasDiscountedPriceUpdate ? Number(discounted_price) : null

    if (hasPriceUpdate && (!Number.isFinite(parsedPrice) || (parsedPrice as number) <= 0)) {
      return res.status(400).json({ message: "price must be a valid number greater than 0" })
    }
    if (
      hasDiscountedPriceUpdate &&
      (!Number.isFinite(parsedDiscountedPrice) || (parsedDiscountedPrice as number) <= 0)
    ) {
      return res.status(400).json({ message: "discounted_price must be a valid number greater than 0" })
    }
    if (hasPriceUpdate && hasDiscountedPriceUpdate && (parsedDiscountedPrice as number) >= (parsedPrice as number)) {
      return res
        .status(400)
        .json({ message: "discounted_price must be lower than original price" })
    }

    // Update product using product service directly
    const updateData: any = {}
    if (title) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (handle !== undefined) updateData.handle = handle
    if (category_ids) updateData.category_ids = category_ids
    if (collection_id !== undefined) updateData.collection_id = collection_id || null
    if (images) updateData.images = images
    if (weight !== undefined) updateData.weight = weight

    const nowIso = new Date().toISOString()
    const cleanRemark = typeof vendor_edit_remark === "string" ? vendor_edit_remark.trim() : ""
    const existingHistory = Array.isArray((metadata as any)?.vendor_edit_history)
      ? (metadata as any).vendor_edit_history
      : []
    const nextHistory = cleanRemark
      ? [
          ...existingHistory,
          {
            remark: cleanRemark,
            submitted_at: nowIso,
            vendor_id: auth.vendor_id,
          },
        ]
      : existingHistory

    // Preserve vendor_id in metadata
    updateData.metadata = {
      ...metadata,
      ...(requestMetadata && typeof requestMetadata === "object" ? requestMetadata : {}),
      vendor_id: auth.vendor_id,
      approval_status: "pending",
      submitted_at: nowIso,
      resubmitted_at: nowIso,
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      vendor_edit_remark: cleanRemark || null,
      vendor_edit_history: nextHistory,
    }
    updateData.status = ProductStatus.DRAFT

    const updatedProduct = await productModuleService.updateProducts(productId, updateData)

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

    // Update first variant prices (if provided)
    if (hasPriceUpdate || hasDiscountedPriceUpdate) {
      try {
        const knex = req.scope.resolve("__pg_connection__") as any
        const pricingModule = req.scope.resolve(Modules.PRICING) as any

        const firstVariant = await knex("product_variant")
          .where({ product_id: productId })
          .orderBy("created_at", "asc")
          .first("id")

        if (firstVariant?.id) {
          const priceSetRow = await knex("product_variant_price_set")
            .where({ variant_id: firstVariant.id })
            .first("price_set_id")

          if (priceSetRow?.price_set_id) {
            const currencyCode = "inr"
            const now = new Date()

            const upsertPrice = async (amount: number, priceListId: string | null) => {
              const queryBuilder = knex("price")
                .where({
                  price_set_id: priceSetRow.price_set_id,
                  currency_code: currencyCode,
                })

              if (priceListId) {
                queryBuilder.where({ price_list_id: priceListId })
              } else {
                queryBuilder.whereNull("price_list_id")
              }

              const existingRow = await queryBuilder.first("id")

              if (existingRow?.id) {
                await knex("price")
                  .where({ id: existingRow.id })
                  .update({
                    amount,
                    raw_amount: amount,
                    updated_at: now,
                  })
                return
              }

              await knex("price").insert({
                id: `price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                price_set_id: priceSetRow.price_set_id,
                price_list_id: priceListId,
                currency_code: currencyCode,
                amount,
                raw_amount: amount,
                min_quantity: 1,
                rules_count: 0,
                created_at: now,
                updated_at: now,
              })
            }

            if (hasPriceUpdate) {
              await upsertPrice(parsedPrice as number, null)
            }

            if (hasDiscountedPriceUpdate) {
              const existingDiscountedPrice = await knex("price")
                .where({
                  price_set_id: priceSetRow.price_set_id,
                  currency_code: currencyCode,
                })
                .whereNotNull("price_list_id")
                .first("price_list_id")

              let priceListId = existingDiscountedPrice?.price_list_id || null

              if (!priceListId) {
                const activePriceLists =
                  typeof pricingModule?.listPriceLists === "function"
                    ? await pricingModule.listPriceLists({ status: ["active"] }).catch(() => [])
                    : []
                const preferred =
                  activePriceLists.find((pl: any) =>
                    (pl?.title || "").toString().toLowerCase().includes("india")
                  ) || activePriceLists[0]
                priceListId = preferred?.id || null
              }

              if (priceListId) {
                await upsertPrice(parsedDiscountedPrice as number, priceListId)
              } else {
                throw new Error("No active price list available for discounted price update")
              }
            }
          }
        }
      } catch (priceUpdateError: any) {
        console.error("Vendor product price update error:", priceUpdateError)
        return res.status(500).json({ message: "Product details saved but failed to update price" })
      }
    }

    return res.json({ product: updatedProduct })
  } catch (error: any) {
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

    // Delete product (soft delete via status change or hard delete)
    await productModuleService.deleteProducts([productId])

    return res.json({ message: "Product deleted successfully" })
  } catch (error: any) {
    console.error("Vendor product delete error:", error)
    return res.status(500).json({ message: error?.message || "Failed to delete product" })
  }
}

