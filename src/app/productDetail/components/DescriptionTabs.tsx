'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'
import type { DescriptionLine, DescriptionTab } from '../types'
import { formatPlainDescription, formatHtmlDescription } from '../utils/description'
import ReviewForm from './ReviewForm'
import ReviewsList from './ReviewsList'

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
    <div className="space-y-8 lg:pl-4">
      <div className="flex gap-6 border-b border-slate-100 mb-6">
        {(['description', 'reviews', 'compare'] as DescriptionTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
              activeTab === tab ? 'text-green-700 border-green-600' : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            {tab === 'description' ? 'Description' : tab === 'reviews' ? 'Reviews' : 'Compare'}
          </button>
        ))}
      </div>
      {activeTab === 'description' && (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Product Description</h2>
            {product?.description ? (
              descriptionHasHtml ? (
                <div
                  className="prose prose-sm max-w-none text-slate-700"
                  dangerouslySetInnerHTML={{ __html: formatHtmlDescription(product.description) }}
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
          </div>

          {highlights.length > 0 && (
            <div>
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

          {detailPairs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Product Details</h3>
              <div className="space-y-3">
                {detailPairs.map((pair) => (
                  <div
                    key={pair.label}
                    className="flex flex-col rounded-2xl border border-slate-100 bg-[#f9fcf8] px-4 py-3 text-sm"
                  >
                    <span className="text-xs uppercase tracking-wide text-slate-500">{pair.label}</span>
                    <span className="text-base font-semibold text-slate-800">{pair.value}</span>
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
