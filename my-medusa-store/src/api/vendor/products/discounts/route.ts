import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

interface DiscountItem {
  product_title: string
  product_id: string
  variant_id: string
  sku: string
  currency_code: string
  base_amount: number
  discounted_amount: number
  discount_value: number
  discount_percent: number
  price_list_id: string
  price_list_title: string
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const pricingModule = req.scope.resolve(Modules.PRICING)
    const productModule = req.scope.resolve(Modules.PRODUCT)

    // Step 1: Get all active price lists
    const priceLists = await pricingModule.listPriceLists({
      status: ["active"]
    })

    if (priceLists.length === 0) {
      return res.json({ total: 0, discounts: [] })
    }

    // Step 2: Get all price list prices (discounted prices)
    const priceListIds = priceLists.map(pl => pl.id)
    const allPriceListPrices = await pricingModule.listPrices({
      price_list_id: priceListIds
    }) as any[]

    if (allPriceListPrices.length === 0) {
      return res.json({ total: 0, discounts: [] })
    }

    // Step 3: Get unique price_set_ids from price list prices
    const priceSetIds = [...new Set(
      allPriceListPrices.map(p => p.price_set_id).filter(Boolean)
    )] as string[]

    // Step 4: Get all prices for these price sets (to find base prices)
    const allPrices = await pricingModule.listPrices({
      price_set_id: priceSetIds
    }) as any[]

    // Step 5: Get variant-price_set links
    // Since Medusa doesn't expose this via ORM, we use one minimal knex query
    const knex = req.scope.resolve("__pg_connection__")
    const linkResult = await knex("product_variant_price_set")
      .whereIn("price_set_id", priceSetIds)
      .select("variant_id", "price_set_id")

    const priceSetToVariantMap = new Map<string, string>()
    for (const link of linkResult) {
      priceSetToVariantMap.set(link.price_set_id, link.variant_id)
    }

    // Get unique variant IDs
    const variantIds = [...new Set(Array.from(priceSetToVariantMap.values()))]

    if (variantIds.length === 0) {
      return res.json({ total: 0, discounts: [] })
    }

    // Step 6: Fetch ONLY the variants we need (much faster than loading all 20k variants)
    const variants = await productModule.listProductVariants(
      { id: variantIds },
      { relations: ["product"] }
    )

    // Build variant map
    const variantMap = new Map()
    for (const variant of variants) {
      variantMap.set(variant.id, variant)
    }

    // Build price list map
    const priceListMap = new Map()
    for (const priceList of priceLists) {
      priceListMap.set(priceList.id, priceList)
    }

    // Step 7: Calculate discounts
    const discounts: DiscountItem[] = []

    for (const discountPrice of allPriceListPrices) {
      const priceListId = (discountPrice as any).price_list_id
      if (!discountPrice.price_set_id || !discountPrice.currency_code || !priceListId) {
        continue
      }

      // Find base price (no price list, same currency, same price set)
      const basePrice = allPrices.find(p =>
        p.price_set_id === discountPrice.price_set_id &&
        !(p as any).price_list_id && // No price list = base price
        p.currency_code === discountPrice.currency_code &&
        (!p.min_quantity || Number(p.min_quantity) <= 1) &&
        (!p.max_quantity || Number(p.max_quantity) >= 1)
      )

      if (!basePrice?.amount || !discountPrice.amount) {
        continue
      }

      const basePriceAmount = Number(basePrice.amount)
      const discountedAmount = Number(discountPrice.amount)

      // Only include actual discounts
      if (discountedAmount >= basePriceAmount) {
        continue
      }

      // Get variant info
      const variantId = priceSetToVariantMap.get(discountPrice.price_set_id)
      if (!variantId) continue

      const variant = variantMap.get(variantId)
      if (!variant?.product) continue

      const priceList = priceListMap.get(priceListId)
      if (!priceList) continue

      const discountValue = basePriceAmount - discountedAmount
      const discountPercent = (discountValue / basePriceAmount * 100)

      discounts.push({
        product_title: variant.product.title || '',
        product_id: variant.product.id || '',
        variant_id: variant.id,
        sku: variant.sku || '',
        currency_code: discountPrice.currency_code,
        base_amount: basePriceAmount,
        discounted_amount: discountedAmount,
        discount_value: discountValue,
        discount_percent: Math.round(discountPercent * 100) / 100,
        price_list_id: priceList.id,
        price_list_title: priceList.title || ''
      })
    }

    // Sort results
    discounts.sort((a, b) => {
      const titleCompare = a.product_title.localeCompare(b.product_title)
      if (titleCompare !== 0) return titleCompare
      return a.sku.localeCompare(b.sku)
    })

    return res.json({
      total: discounts.length,
      discounts
    })
  } catch (error: any) {
    console.error("Discount analysis error:", error)
    return res.status(500).json({
      error: error.message,
      message: "Failed to calculate discounts",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
