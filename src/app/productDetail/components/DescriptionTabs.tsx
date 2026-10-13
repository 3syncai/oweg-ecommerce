'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'
import type { DescriptionLine, DescriptionTab } from '../types'
import { formatPlainDescription, formatHtmlDescription } from '../utils/description'
import { sanitizeProductHtml } from '@/lib/sanitize-product-html'
import ReviewForm from './ReviewForm'
import ReviewsList from './ReviewsList'
import styles from '../ProductDetail.module.css'

type DescriptionTabsProps = {
  activeTab: DescriptionTab
  onTabChange: (tab: DescriptionTab) => void
  product: DetailedProductType | null
  descriptionHasHtml: boolean
  highlights: string[]
  detailPairs: Array<{ label: string; value: string }>
}

const DescriptionTabs = ({
  activeTab,
  onTabChange,
  product,
  descriptionHasHtml,
  highlights,
  detailPairs,
}: DescriptionTabsProps) => {
  const descriptionLines: DescriptionLine[] = product?.description ? formatPlainDescription(product.description) : []
  const queryClient = useQueryClient()

  return (
    <div className={styles.tabs}>
      <div className={styles.tabBar}>
        {(['description', 'reviews', 'compare'] as DescriptionTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            aria-pressed={activeTab === tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
          >
            {tab === 'description' ? 'Description' : tab === 'reviews' ? 'Reviews' : 'Compare'}
          </button>
        ))}
      </div>
      {activeTab === 'description' && (
        <div className={styles.descriptionLayout}>
          <div className={styles.descriptionContent}>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Product Description</h2>
            {product?.description ? (
              descriptionHasHtml ? (
                <div
                  className={styles.htmlDescription}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeProductHtml(formatHtmlDescription(product.description)),
                  }}
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-700 leading-relaxed list-disc pl-5 marker:text-green-500">
                  {descriptionLines.map((item, idx) => (
                    <li key={idx}>
                      {item.label ? (
                        <>
                          <span className="font-semibold text-slate-900">{item.label}: </span>
                          <span>{item.value}</span>
                        </>
                      ) : (
                        item.value
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-sm text-slate-500">Detailed description will be available soon.</p>
            )}
          {highlights.length > 0 && (
            <div className={styles.benefits}>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Benefits</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {highlights.map((highlight) => (
                  <div
                    key={`benefit-${highlight}`}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f9fcf8] p-3 text-sm text-slate-700"
                  >
                    <Check className="w-4 h-4 text-green-600 mt-1" />
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {detailPairs.length > 0 && (
            <div className={styles.specifications}>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Product Details</h3>
              <div className="space-y-3">
                {detailPairs.map((pair) => (
                  <div
                    key={pair.label}
                    className={styles.specRow}
                  >
                    <span>{pair.label}</span>
                    <span>{pair.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'reviews' && (
        <div className="space-y-8">
          {/* Write Review Section */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Write a Review</h2>
            <ReviewForm
              productId={product?.id || ''}
              productName={product?.title || 'Product'}
              productImage={product?.thumbnail || product?.images?.[0]}
              onSubmitSuccess={() => {
                // Invalidate and refetch reviews
                queryClient.invalidateQueries({ queryKey: ['reviews', product?.id] })
              }}
            />
          </div>

          {/* Reviews List Section */}
          <div className="mt-12">
            <ReviewsList productId={product?.id || ''} />
          </div>
        </div>
      )}
    </div>
  )
}

export default DescriptionTabs
