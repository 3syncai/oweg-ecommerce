
import { useState, useEffect, useCallback } from "react"


export type ShippingOption = {
  id: string
  name: string
  amount: number
  calculated_price_incl_tax?: number
  price_type: "flat_rate" | "calculated"
  data?: Record<string, unknown>
}

type UseShippingOptionsResult = {
  options: ShippingOption[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export const useShippingOptions = (cartId: string | undefined): UseShippingOptionsResult => {
  const [options, setOptions] = useState<ShippingOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOptions = useCallback(async () => {
    if (!cartId) {
        setOptions([])
        return
    }

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/medusa/shipping-options?cart_id=${encodeURIComponent(cartId)}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        // If 400/404, just set empty to avoid breaking UI, but log it
        console.warn("Shipping options fetch failed", res.status)
        setOptions([])
        return
      }
      const data = await res.json()
      // Medusa v2 Store API returns { shipping_options: [...] }
      setOptions(data.shipping_options || [])
    } catch (err) {
      console.error(err)
      setError("Unable to fetch shipping options")
      // Start with empty to avoid UI flicker of old options if any
      setOptions([])
    } finally {
      setIsLoading(false)
    }
  }, [cartId])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  return {
    options,
    isLoading,
    error,
    refetch: fetchOptions
  }
}
