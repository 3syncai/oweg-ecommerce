'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'

export type FlashSaleInfo = {
  active: boolean
  flash_sale_price?: number
  original_price?: number
  expires_at?: string
  time_remaining_ms?: number
}

/**
 * Hook to fetch flash sale information for a specific product
 */
export function useFlashSale(productId: string | undefined) {
  const [flashSaleInfo, setFlashSaleInfo] = useState<FlashSaleInfo>({ active: false })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId) {
      setFlashSaleInfo({ active: false })
      return
    }

    let fetching = false
    let disposed = false
    const controller = new AbortController()
    const fetchFlashSale = async () => {
      if (disposed || fetching || document.visibilityState === 'hidden') return
      fetching = true
      setLoading(true)
      try {
        const response = await axios.get('/api/medusa/flash-sale/products', { signal: controller.signal })
        if (disposed) return

        if (response.status === 200) {
          const data = response.data

          if (data.active && data.products) {
            const product = data.products.find((p: { id: string; flash_sale_price?: number; original_price?: number; flash_sale?: { expires_at: string; time_remaining_ms: number } }) => p.id === productId)

            if (product && product.flash_sale) {
              // Belt-and-braces: coerce numeric prices in case the upstream
              // API serializes Postgres NUMERICs as strings. Comparing
              // strings ("1000" vs "900") gives the wrong answer.
              const toNum = (v: unknown): number | undefined => {
                if (typeof v === "number" && Number.isFinite(v)) return v
                if (typeof v === "string" && v.trim() !== "") {
                  const n = Number(v)
                  return Number.isFinite(n) ? n : undefined
                }
                return undefined
              }
              setFlashSaleInfo({
                active: true,
                flash_sale_price: toNum(product.flash_sale_price),
                original_price: toNum(product.original_price),
                expires_at: product.flash_sale.expires_at,
                time_remaining_ms: product.flash_sale.time_remaining_ms,
              })
              return
            }
          }
        }

        setFlashSaleInfo({ active: false })
      } catch (error) {
        if (disposed) return
        console.error('[useFlashSale] Failed to fetch flash sale:', error)
        setFlashSaleInfo({ active: false })
      } finally {
        fetching = false
        if (!disposed) setLoading(false)
      }
    }

    fetchFlashSale()

    // Refresh every 60 seconds to update countdown
    const interval = setInterval(fetchFlashSale, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchFlashSale() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { disposed = true; controller.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [productId])

  return { flashSaleInfo, loading }
}

/**
 * Format time remaining from milliseconds to readable format
 */
export function formatTimeRemaining(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { hours, minutes, seconds }
}

