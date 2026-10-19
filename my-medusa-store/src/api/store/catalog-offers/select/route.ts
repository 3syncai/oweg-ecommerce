import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listSameSkuOffers, selectSameSkuOfferWithDecision } from "../../../../lib/vendor-offer-routing"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"
import type FlashSaleModuleService from "../../../../modules/flash-sale/service"

async function matchesActiveFlashPrice(req: MedusaRequest, variantId: string, price: number) {
  const service = req.scope.resolve(FLASH_SALE_MODULE) as FlashSaleModuleService
  const items = await service.listFlashSaleItems({ variant_id: variantId })
  const now = Date.now()
  return items.some(item => !item.deleted_at && new Date(item.expires_at).getTime() > now
    && Math.abs(Number(item.flash_sale_price) - price) < 0.005)
}

/** Checkout replaces only the vendor variant. The customer's unit price stays fixed. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const items = (req.body as any)?.items
  const postalCode = String((req.body as any)?.delivery_postal_code || "").trim()
  if (postalCode && !/^\d{6}$/.test(postalCode)) return res.status(400).json({ message: "Invalid delivery postal code" })
  if (!Array.isArray(items) || items.length > 100) return res.status(400).json({ message: "Invalid checkout items" })
  try {
    const selections = await Promise.all(items.map(async (item: any) => {
      const variantId = String(item?.variant_id || "")
      const quantity = Number(item?.quantity)
      const price = Number(item?.unit_price)
      if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0)
        throw new Error("Invalid checkout item")
      const decision = item?.seller_selected ? null
        : await selectSameSkuOfferWithDecision(variantId, quantity, price, postalCode)
      let selected = decision?.selected
      if (item?.seller_selected) {
        const offer = (await listSameSkuOffers(variantId)).find(offer => offer.variant_id === variantId && offer.available >= quantity)
        selected = offer && (offer.prices.some(amount => Math.abs(amount - price) < 0.005)
          || await matchesActiveFlashPrice(req, variantId, price)) ? offer : null
      }
      if (item?.seller_selected && !selected) throw new Error("Selected seller is out of stock or its price changed")
      if (!selected) throw new Error("No approved vendor has this exact variant in stock at the checkout price")
      return { original_variant_id: variantId, variant_id: selected.variant_id,
        assignment: { selected_vendor_id: selected.vendor_id, selected_variant_id: selected.variant_id,
          reason: item?.seller_selected ? "customer_selected" : decision?.reason,
          candidates: decision?.candidates || [], selected_at: new Date().toISOString() } }
    }))
    return res.json({ selections })
  } catch (error: any) {
    if (error?.message === "Invalid checkout item") return res.status(400).json({ message: error.message })
    if (error?.message === "Selected seller is out of stock or its price changed" || error?.message === "No approved vendor has this exact variant in stock at the checkout price") return res.status(409).json({ message: error.message })
    console.error("[catalog-offers] selection failed", error)
    return res.status(503).json({ message: "Vendor stock is temporarily unavailable" })
  }
}
