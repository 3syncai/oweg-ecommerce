'use client'

import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'

export type ProductDetailProps = {
  productId: string
}

export type RelatedProduct = {
  id: string | number
  name: string
  image: string
  price: number
  mrp: number
  discount: number
  handle?: string
  variant_id?: string
  brand?: string
  color?: string
  highlights?: string[]
  category_ids?: string[]
  summary?: {
    bestFor?: string
    wattage?: string
    size?: string
    brand?: string
    noiseLevel?: string
    warranty?: string
  }
}

export type DescriptionLine = { label?: string; value: string }

export type ComparisonColumn = {
  key: string
  item: RelatedProduct
  idx: number
  isBase: boolean
  detail?: DetailedProductType | null
  loading: boolean
  brand: string
  model: string
  availabilityLabel: string
  availabilityState: 'in' | 'out' | 'unknown'
  rating: number
  summary: string
  weight: string
  dimensions: string
  variantId?: string
  productHref: string
}

export type CompareFilters = {
  brand: string
  color: string
}

export type PinStatus = 'idle' | 'checking' | 'available' | 'unavailable'

export type DescriptionTab = 'description' | 'reviews' | 'compare'

export type BreadcrumbItem = {
  label: string
  href?: string
}
