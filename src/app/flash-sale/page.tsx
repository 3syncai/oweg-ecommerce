import type { Metadata } from 'next'
import FlashSaleSection from '@/components/flash-sale/FlashSaleSection'

export const metadata: Metadata = {
  title: 'Flash sale deals',
  description: 'Explore current OWEG deals on home, kitchen and electronics products while stock lasts.',
}

export default function FlashSalePage() {
  return <div className="oweg-page min-h-screen py-6 pb-10">
    <FlashSaleSection view="all" inStockOnly showImageFallback />
  </div>
}
