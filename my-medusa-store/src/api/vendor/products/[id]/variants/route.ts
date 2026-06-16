import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  detectVisualOption,
  sanitizeColorImages,
} from "../../../../../lib/variant-matrix"
import {
  fetchProductVariantMatrix,
  syncVariantInventoryLevels,
  syncVariantThumbnailsFromColorImages,
} from "../../../../../lib/vendor-product-variants"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
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
    const metadata = ((product as { metadata?: Record<string, unknown> }).metadata || {}) as Record<
      string,
      unknown
    >

    if (metadata.vendor_id !== auth.vendor_id) {
      return res.status(403).json({ message: "Product does not belong to this vendor" })
    }

    const body = (req as { body?: Record<string, unknown> }).body || {}
    const {
      variants: variantUpdates,
      color_images,
      primary_visual_option,
      images,
      vendor_edit_remark,
    } = body

    const knex = req.scope.resolve("__pg_connection__") as any

    const pricingModule = req.scope.resolve(Modules.PRICING) as {
      listPriceLists?: (filters: { status: string[] }) => Promise<Array<{ id: string; title?: string }>>
    }

    if (Array.isArray(variantUpdates)) {
      for (const variant of variantUpdates) {
        if (!variant || typeof variant !== "object") continue
        const variantId = typeof variant.id === "string" ? variant.id : null
        if (!variantId) continue

        const belongs = await knex("product_variant")
          .where({ id: variantId, product_id: productId })
          .first("id")

        if (!belongs?.id) continue

        if (typeof variant.sku === "string") {
          await knex("product_variant")
            .where({ id: variantId })
            .update({ sku: variant.sku.trim() || null, updated_at: new Date() })
        }

        const price = variant.price != null ? Number(variant.price) : null
        const discountedPrice =
          variant.discounted_price != null ? Number(variant.discounted_price) : null

        if (Number.isFinite(price) && (price as number) > 0) {
          const priceSetRow = await knex("product_variant_price_set")
            .where({ variant_id: variantId })
            .first("price_set_id")

          if (priceSetRow?.price_set_id) {
            const upsertPrice = async (amount: number, priceListId: string | null) => {
              const queryBuilder = knex("price").where({
                price_set_id: priceSetRow.price_set_id,
                currency_code: "inr",
              })

              if (priceListId) {
                queryBuilder.where({ price_list_id: priceListId })
              } else {
                queryBuilder.whereNull("price_list_id")
              }

              const existingRow = await queryBuilder.first("id")
              const now = new Date()

              if (existingRow?.id) {
                await knex("price")
                  .where({ id: existingRow.id })
                  .update({ amount, raw_amount: amount, updated_at: now })
              } else {
                await knex("price").insert({
                  id: `price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  price_set_id: priceSetRow.price_set_id,
                  price_list_id: priceListId,
                  currency_code: "inr",
                  amount,
                  raw_amount: amount,
                  min_quantity: 1,
                  rules_count: 0,
                  created_at: now,
                  updated_at: now,
                })
              }
            }

            await upsertPrice(price as number, null)

            if (Number.isFinite(discountedPrice) && (discountedPrice as number) > 0) {
              const existingDiscountedPrice = await knex("price")
                .where({ price_set_id: priceSetRow.price_set_id, currency_code: "inr" })
                .whereNotNull("price_list_id")
                .first("price_list_id")

              let priceListId = existingDiscountedPrice?.price_list_id as string | null

              if (!priceListId && typeof pricingModule.listPriceLists === "function") {
                const activePriceLists = await pricingModule
                  .listPriceLists({ status: ["active"] })
                  .catch(() => [])
                const preferred =
                  activePriceLists.find((pl) =>
                    (pl.title || "").toLowerCase().includes("india")
                  ) || activePriceLists[0]
                priceListId = preferred?.id || null
              }

              if (priceListId) {
                await upsertPrice(discountedPrice as number, priceListId)
              }
            }
          }
        }
      }

      await syncVariantInventoryLevels(
        req,
        variantUpdates.map((variant: Record<string, unknown>) => ({
          id: typeof variant.id === "string" ? variant.id : undefined,
          sku: typeof variant.sku === "string" ? variant.sku : null,
          manage_inventory: variant.manage_inventory !== false,
          inventory_quantity:
            typeof variant.inventory_quantity === "number"
              ? variant.inventory_quantity
              : undefined,
        }))
      )
    }

    const updateData: Record<string, unknown> = {}
    const nextMetadata = { ...metadata }

    if (color_images && typeof color_images === "object") {
      const matrix = await fetchProductVariantMatrix(req, productId)
      const visualValues = new Set<string>()
      for (const opt of matrix.options) {
        if (/color|colour|pattern|finish|shade|style/i.test(opt.title)) {
          opt.values.forEach((v) => visualValues.add(v))
        }
      }
      nextMetadata.color_images = sanitizeColorImages(color_images, visualValues)
    }

    if (typeof primary_visual_option === "string" && primary_visual_option.trim()) {
      nextMetadata.primary_visual_option = primary_visual_option.trim()
    } else if (color_images && !nextMetadata.primary_visual_option) {
      const matrix = await fetchProductVariantMatrix(req, productId)
      const visual = detectVisualOption(matrix.options.map((o) => o.title))
      if (visual) nextMetadata.primary_visual_option = visual
    }

    const nowIso = new Date().toISOString()
    const cleanRemark =
      typeof vendor_edit_remark === "string" ? vendor_edit_remark.trim() : ""
    const existingHistory = Array.isArray(nextMetadata.vendor_edit_history)
      ? nextMetadata.vendor_edit_history
      : []

    nextMetadata.vendor_id = auth.vendor_id
    nextMetadata.approval_status = "pending"
    nextMetadata.resubmitted_at = nowIso
    nextMetadata.vendor_edit_remark = cleanRemark || null
    nextMetadata.vendor_edit_history = cleanRemark
      ? [
          ...existingHistory,
          {
            remark: cleanRemark,
            submitted_at: nowIso,
            vendor_id: auth.vendor_id,
          },
        ]
      : existingHistory

    updateData.metadata = nextMetadata
    updateData.status = ProductStatus.DRAFT

    if (Array.isArray(images)) {
      updateData.images = images
        .map((img: unknown) => {
          if (typeof img === "string") return { url: img }
          if (img && typeof img === "object" && "url" in img) {
            return { url: String((img as { url: string }).url) }
          }
          return null
        })
        .filter(Boolean)
    }

    await productModuleService.updateProducts(productId, updateData)

    const visualOption =
      (typeof nextMetadata.primary_visual_option === "string"
        ? nextMetadata.primary_visual_option
        : undefined) ||
      detectVisualOption(
        (await fetchProductVariantMatrix(req, productId)).options.map((o) => o.title)
      )

    if (
      visualOption &&
      nextMetadata.color_images &&
      typeof nextMetadata.color_images === "object"
    ) {
      await syncVariantThumbnailsFromColorImages(
        req,
        productId,
        nextMetadata.color_images as Record<string, string[]>,
        visualOption
      )
    }

    const variantMatrix = await fetchProductVariantMatrix(req, productId)

    return res.json({
      product_id: productId,
      variant_matrix: variantMatrix,
      metadata: nextMetadata,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update variants"
    console.error("Vendor variant matrix update error:", error)
    return res.status(500).json({ message })
  }
}
