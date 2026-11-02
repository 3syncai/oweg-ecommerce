import axios from 'axios'
import { inStockHomeFlashSale } from '@/lib/home-flash-sale'
import { createFlashSaleCache, type FlashSalePayload } from '@/lib/flash-sale-cache'
const loadCached = createFlashSaleCache()
const loadAllCached = createFlashSaleCache()

export async function loadFlashSale({ all = false, homeOnly = false } = {}): Promise<FlashSalePayload> {
  const data = await (all ? loadAllCached : loadCached)(async () => {
      const backendUrl = process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
      const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
      const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (publishableKey) headers['x-publishable-api-key'] = publishableKey
      if (salesChannelId) headers['x-sales-channel-id'] = salesChannelId
      const response = await axios.get<FlashSalePayload>(`${backendUrl}/store/flash-sale/products${all ? '?all=1' : ''}`, { headers, timeout: 15000 })
      return response.data
    })
  return (homeOnly ? await inStockHomeFlashSale(data as Parameters<typeof inStockHomeFlashSale>[0], { all }) : data) as FlashSalePayload
 }
