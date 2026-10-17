import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listSameSkuOffers, selectSameSkuOffer } from "../../../../lib/vendor-offer-routing"

/** Checkout replaces only the vendor variant. The customer's unit price stays fixed. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const items = (req.body as any)?.items
  if (!Array.isArray(items) || items.length > 100) return res.status(400).json({ message: "Invalid checkout items" })
  try {
    const selections = await Promise.all(items.map(async (item: any) => {
      const variantId = String(item?.variant_id || "")
      const quantity = Number(item?.quantity)
      const price = Number(item?.unit_price)
      if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0)
        throw new Error("Invalid checkout item")
      const selected = item?.seller_selected
        ? (await listSameSkuOffers(variantId)).find(offer => offer.variant_id === variantId && offer.available >= quantity && offer.prices.some(amount => Math.abs(amount - price) < 0.005))
        : await selectSameSkuOffer(variantId, quantity, price)
      if (item?.seller_selected && !selected) throw new Error("Selected seller is out of stock or its price changed")
      return { original_variant_id: variantId, variant_id: selected?.variant_id || variantId }
    }))
    return res.json({ selections })
  } catch (error: any) {
    if (error?.message === "Invalid checkout item") return res.status(400).json({ message: error.message })
    if (error?.message === "Selected seller is out of stock or its price changed") return res.status(409).json({ message: error.message })
    console.error("[catalog-offers] selection failed", error)
    return res.status(503).json({ message: "Vendor stock is temporarily unavailable" })
  }
}
