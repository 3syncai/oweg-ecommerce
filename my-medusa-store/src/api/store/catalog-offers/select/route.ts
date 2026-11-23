import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { flashOfferDelivery } from "../../../../lib/flash-offer-delivery"
import { evaluateFlashOffer } from "../../../../lib/flash-sale-eligibility"
import { type OfferCandidate, listSameSkuOffers, selectSameSkuOfferWithDecision } from "../../../../lib/vendor-offer-routing"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"
import type FlashSaleModuleService from "../../../../modules/flash-sale/service"

async function matchesActiveFlashPrice(req: MedusaRequest, variantId: string, price: number, offers: OfferCandidate[], quantity: number) {
  const service = req.scope.resolve(FLASH_SALE_MODULE) as FlashSaleModuleService
  const items = await service.listFlashSaleItems({ variant_id: offers.map(offer => offer.variant_id), expires_at: { $gt: new Date() } }, { take: 10000 })
  const now = Date.now()
  const active = items.filter(item => !item.deleted_at && +new Date(item.expires_at) > now)
  return active.some(item => item.variant_id === variantId
    && !evaluateFlashOffer(item, offers, 1, active).reason && !evaluateFlashOffer(item, offers, quantity, active).reason
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
      if (item?.seller_selected || !selected) {
        const offers = await listSameSkuOffers(variantId, true)
        const offer = offers.find(offer => offer.variant_id === variantId && offer.available >= quantity)
        selected = offer && ((item?.seller_selected && offer.prices.some(amount => Math.abs(amount - price) < 0.005))
          || (await matchesActiveFlashPrice(req, variantId, price, offers, quantity) && await flashOfferDelivery(offer, postalCode, quantity, price) !== false)) ? offer : null
      }
      if (item?.seller_selected && !selected) throw new Error("Selected seller is out of stock or its price changed")
      if (!selected) throw new Error("No approved vendor has this exact variant in stock at the checkout price")
      return { original_variant_id: variantId, variant_id: selected.variant_id,
        assignment: { selected_vendor_id: selected.vendor_id, selected_variant_id: selected.variant_id,
          reason: item?.seller_selected ? "customer_selected" : (decision?.selected ? decision.reason : "flash_sale_offer"),
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
