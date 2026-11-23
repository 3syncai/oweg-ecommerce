import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listSameSkuOffers, publicSellerOffers } from "../../../lib/vendor-offer-routing"

import { flashOfferDelivery } from "../../../lib/flash-offer-delivery"
import { FLASH_SALE_MODULE } from "../../../modules/flash-sale"
import type FlashSaleModuleService from "../../../modules/flash-sale/service"
import { evaluateFlashOffer } from "../../../lib/flash-sale-eligibility"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const variantId = String(req.query.variant_id || "")
  if (!variantId || variantId.length > 255) return res.status(400).json({ message: "variant_id required" })
  try {
    const candidates = await listSameSkuOffers(variantId, req.query.deals === "1")
    const regular = publicSellerOffers(candidates)
    if (req.query.deals !== "1" || !regular.length) return res.json({ offers: regular, sold_out: candidates.length > 0 && candidates.every(offer => offer.available < 1) })
    const service: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const sales = await service.listFlashSaleItems({ variant_id: regular.map(o => o.variant_id), expires_at: { $gt: new Date() } }, { take: 10000 })
    const quantity = Number(req.query.quantity ?? 1)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) return res.status(400).json({ message: "Invalid quantity" })
    const now = Date.now()
    const active = sales.filter(sale => +new Date(sale.expires_at) > now)
    const byId = new Map(candidates.map(offer => [offer.variant_id, offer]))
    const offers = await Promise.all(regular.map(async offer => {
      const candidate = byId.get(offer.variant_id)!
      const deal = active.filter(sale => sale.variant_id === offer.variant_id
        && !evaluateFlashOffer(sale, candidates, 1, active).reason && !evaluateFlashOffer(sale, candidates, quantity, active).reason)
        .sort((a, b) => Number(a.flash_sale_price) - Number(b.flash_sale_price))[0]
      if (deal && await flashOfferDelivery(candidate, String(req.query.pincode ?? ""), quantity, Number(deal.flash_sale_price)) === false) return { ...offer, delivery_unavailable: true }
      return deal ? { ...offer, price: Number(deal.flash_sale_price), flash_sale: {
        active: true, variant_id: offer.variant_id, title: deal.title, flash_sale_price: Number(deal.flash_sale_price),
        original_price: Math.min(Number(deal.original_price), offer.price, Number(candidate.recent_regular) || offer.price), expires_at: deal.expires_at,
        time_remaining_ms: +new Date(deal.expires_at) - now,
      } } : offer
    }))
    offers.sort((a, b) => Number("delivery_unavailable" in a) - Number("delivery_unavailable" in b) || Number(b.available >= quantity) - Number(a.available >= quantity) || a.price - b.price || b.available - a.available)
    return res.json({ offers })
  } catch (error) {
    console.error("[catalog-offers] listing failed", error)
    return res.status(503).json({ message: "Seller offers are temporarily unavailable" })
  }
}
