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

    const fetchFlashSale = async () => {
      setLoading(true)
      try {
        const response = await axios.get('/api/medusa/flash-sale/products', {
          headers: {
            'Cache-Control': 'no-store',
          },
        })
        
        if (response.status === 200) {
          const data = response.data
          
          if (data.active && data.products) {
            const product = data.products.find((p: { id: string; flash_sale_price?: number; original_price?: number; flash_sale?: { expires_at: string; time_remaining_ms: number } }) => p.id === productId)
            
            if (product && product.flash_sale) {
              setFlashSaleInfo({
                active: true,
                flash_sale_price: product.flash_sale_price,
                original_price: product.original_price,
                expires_at: product.flash_sale.expires_at,
                time_remaining_ms: product.flash_sale.time_remaining_ms,
              })
              return
            }
          }
        }
        
        setFlashSaleInfo({ active: false })
      } catch (error) {
        console.error('[useFlashSale] Failed to fetch flash sale:', error)
        setFlashSaleInfo({ active: false })
      } finally {
        setLoading(false)
      }
    }

    fetchFlashSale()
    
    // Refresh every 60 seconds to update countdown
    const interval = setInterval(fetchFlashSale, 60000)
    return () => clearInterval(interval)
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

