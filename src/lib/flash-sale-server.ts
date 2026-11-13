import axios from 'axios'
import { unstable_cache } from 'next/cache'
import { inStockHomeFlashSale } from '@/lib/home-flash-sale'
import { createFlashSaleCache, currentFlashSale, type FlashSalePayload } from '@/lib/flash-sale-cache'
const loadCached = createFlashSaleCache()
const loadAllCached = createFlashSaleCache()

async function loadAndValidate(all: boolean, homeOnly: boolean): Promise<FlashSalePayload> {
  const load = async () => {
      const backendUrl = process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
      const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
      const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (publishableKey) headers['x-publishable-api-key'] = publishableKey
      if (salesChannelId) headers['x-sales-channel-id'] = salesChannelId
      const response = await axios.get<FlashSalePayload>(`${backendUrl}/store/flash-sale/products${all ? '?all=1' : ''}`, { headers, timeout: all ? 15000 : 5000 })
      return response.data
    }
  const data = await (homeOnly && !all ? load() : (all ? loadAllCached : loadCached)(load))
  return (homeOnly ? await inStockHomeFlashSale(data as Parameters<typeof inStockHomeFlashSale>[0], { all }) : data) as FlashSalePayload
 }

// Share a compact browsing snapshot across storefront instances. The time bucket
// keeps revalidation from serving a previous bucket's stock and display prices.
const readFeaturedDeals = unstable_cache(async (_bucket: number) => {
  const data = await loadAndValidate(false, true)
  if (data.unavailable === true) throw new Error('Featured deals unavailable')
  return {
      active: data.active,
      flash_sale: data.flash_sale,
      products: (data.products ?? []).map(value => {
        const product = value as Record<string, unknown>
        const variants = product.variants as Array<{ id?: string }> | null | undefined
        const metadata = product.metadata as { price?: number; mrp?: number } | null | undefined
        return {
          id: product.id, title: product.title, thumbnail: product.thumbnail,
          images: (product.images as Array<{ url: string }> | undefined)?.slice(0, 1),
          variants: variants?.map(({ id }) => ({ id })), variant_id: product.variant_id,
          flash_sale_price: product.flash_sale_price, original_price: product.original_price,
          display_pricing: product.display_pricing,
          metadata: metadata ? { price: metadata.price, mrp: metadata.mrp } : undefined,
        }
      }),
  }
}, ['featured-deals-v1'], { revalidate: 15 })

const featuredPending = new Map<number, Promise<FlashSalePayload>>()
const validating = new Map<boolean, Promise<FlashSalePayload>>()
export function loadFlashSale({ all = false, homeOnly = false } = {}): Promise<FlashSalePayload> {
  if (!homeOnly) return loadAndValidate(all, false)
  if (!all) {
    const bucket = Math.floor(Date.now() / 15_000)
    const existing = featuredPending.get(bucket)
    if (existing) return existing
    const request = readFeaturedDeals(bucket)
      .then(data => ({ ...currentFlashSale(data), cache_until: (bucket + 1) * 15_000 }))
      .finally(() => featuredPending.delete(bucket))
    featuredPending.set(bucket, request)
    return request
  }
  const existing = validating.get(all)
  if (existing) return existing
  const request = loadAndValidate(all, true).finally(() => {
    if (validating.get(all) === request) validating.delete(all)
  })
  validating.set(all, request)
  return request
}
