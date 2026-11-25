import { customerShipping } from "./storefront-shipping"
import { offersByVariant, type OfferCandidate } from "./vendor-offer-routing"

type Sale = { product_id: string; variant_id: string; flash_sale_price: number; original_price?: number }

export function evaluateFlashOffer(sale: Sale, offers: OfferCandidate[], quantity = 1, campaigns: Sale[] = []) {
  const own = offers.find(o => o.variant_id === sale.variant_id && o.product_id === sale.product_id)
  const regular = own?.prices.length ? Math.min(...own.prices) : 0
  const baseline = Math.min(regular, Number(own?.recent_regular) || regular)
  const price = Number(sale.flash_sale_price)
  const delivered = (unit: number) => unit * quantity + customerShipping(unit * quantity)
  const alternatives = offers.filter(o => o.variant_id !== sale.variant_id && o.available >= quantity && o.prices.length)
    .map(offer => {
      const regularPrice = Math.min(...offer.prices)
      const discounts = campaigns.filter(deal => deal.variant_id === offer.variant_id && deal.product_id === offer.product_id
        && Number(deal.flash_sale_price) > 0 && Number(deal.flash_sale_price) < Number(deal.original_price ?? regularPrice))
      return { seller: offer.store_name, price: Math.min(regularPrice, ...discounts.map(deal => Number(deal.flash_sale_price))) }
    })
  const lowest = [...alternatives].sort((a, b) => a.price - b.price)[0]
  const other = alternatives.sort((a, b) => delivered(a.price) - delivered(b.price))[0]
  const reasons: string[] = []
  if (!own || own.available < quantity) reasons.push("Seller offer unavailable for this quantity.")
  if (!(price > 0 && Number.isFinite(price) && price < baseline && (sale.original_price === undefined || price < Number(sale.original_price)))) {
    reasons.push("Deal must be below the seller’s regular price.")
  }
  if (lowest && price > lowest.price) reasons.push(`${lowest.seller} offers this item for ₹${lowest.price}.`)
  if (other && price <= other.price && delivered(price) > delivered(other.price)) reasons.push("Another seller costs less including shipping for this quantity.")
  if (price < baseline && delivered(price) >= delivered(baseline)) reasons.push("The discount must still save money after shipping.")
  return { regular: baseline, seller: own?.store_name, reason: reasons.join(" ") }
}

export async function assessFlashSales<T extends Sale>(items: T[], campaigns: Sale[] = items) {
  const groups = await offersByVariant(items.map(item => item.variant_id))
  return items.map(item => ({ ...item, ...evaluateFlashOffer(item, groups.get(item.variant_id) ?? [], 1, campaigns) }))
}
