import { useQuery } from "@tanstack/react-query"

export type SellerOffer = {
  variant_id: string
  store_name: string
  price: number
  available: number
}

export function useSellerOffers(variantId?: string) {
  return useQuery({
    queryKey: ["seller-offers", variantId],
    enabled: Boolean(variantId),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/medusa/catalog-offers?variant_id=${encodeURIComponent(variantId!)}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Seller offers unavailable")
      const data = await response.json() as { offers?: SellerOffer[] }
      return (data.offers || []).filter(offer => Number.isFinite(offer.price) && offer.available > 0)
    },
  })
}
