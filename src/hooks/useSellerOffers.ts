import { useQuery } from "@tanstack/react-query"

import type { FlashSaleInfo } from "./useFlashSale"

export type SellerOffer = {
  variant_id: string
  store_name: string
  price: number
  delivery_unavailable?: boolean
  flash_sale?: FlashSaleInfo
  available: number
}

export function useSellerOffers(variantId?: string, quantity = 1, pincode?: string) {
  const query = useQuery({
    queryKey: ["seller-offers", variantId, quantity, pincode?.length === 6 ? pincode : ""],
    enabled: Boolean(variantId),
    refetchInterval: 30_000,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/medusa/catalog-offers?variant_id=${encodeURIComponent(variantId!)}&quantity=${quantity}&pincode=${encodeURIComponent(pincode ?? "")}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Seller offers unavailable")
      const data = await response.json() as { offers?: SellerOffer[]; sold_out?: boolean }
      return { offers: (data.offers || []).filter(offer => Number.isFinite(offer.price) && offer.available > 0), soldOut: data.sold_out === true }
    },
  })
  return { ...query, data: query.data?.offers, soldOut: query.data?.soldOut === true }
}
