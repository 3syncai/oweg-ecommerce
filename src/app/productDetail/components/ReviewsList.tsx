'use client'

import React, { useState, useMemo } from 'react'
import { Star, ThumbsUp, Flag } from 'lucide-react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'

type Review = {
  id: string
  reviewer_name: string
  reviewer_email?: string
  title: string
  content: string
  rating: string
  images?: string[] | null
  videos?: string[] | null
  verified_purchase: boolean
  helpful_count: string
  created_at: string
  variant_id?: string | null
}

type ReviewsListProps = {
  productId: string
}

const ReviewsList = ({ productId }: ReviewsListProps) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reviews', productId],
    queryFn: async () => {
      if (!productId) {
        return []
      }
      try {
        const res = await fetch(`/api/medusa/products/${productId}/reviews`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          console.error('Failed to fetch reviews:', errorData)
          throw new Error(errorData.message || 'Failed to fetch reviews')
        }
        const data = await res.json()
        console.log('Reviews fetched:', data)
        return (data.reviews || []) as Review[]
      } catch (err) {
        console.error('Error in reviews query:', err)
        throw err
      }
    },
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    enabled: !!productId,
  })

  const reviews = useMemo(() => data || [], [data])
  const [helpfulReviews, setHelpfulReviews] = useState<Set<string>>(new Set())
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({})

  // Initialize helpful counts from reviews
  React.useEffect(() => {
    if (reviews.length > 0) {
      const counts: Record<string, number> = {}
      reviews.forEach((review) => {
        counts[review.id] = parseInt(review.helpful_count || '0', 10)
      })
      setHelpfulCounts(counts)
    }
  }, [reviews])

  const handleHelpful = async (reviewId: string) => {
    if (helpfulReviews.has(reviewId)) {
      return // Already marked as helpful
    }

    try {
      const res = await fetch(`/api/medusa/products/${productId}/reviews/${reviewId}/helpful`, {
        method: 'POST',
        credentials: 'include',
      })
      
      if (res.ok) {
        const data = await res.json()
        const newCount = parseInt(data.helpful_count || '0', 10)
        
        // Update local state
        setHelpfulReviews((prev) => new Set(prev).add(reviewId))
        setHelpfulCounts((prev) => ({
          ...prev,
          [reviewId]: newCount,
        }))
        
        // Refetch reviews to get updated data
        refetch()
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error('Failed to mark review as helpful:', errorData)
      }
    } catch (error) {
      console.error('Failed to mark review as helpful:', error)
    }
  }

  const parseRating = (rating: string): number => {
    const num = parseInt(rating, 10)
    return isNaN(num) ? 0 : Math.min(5, Math.max(0, num))
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return dateString
    }
  }

  const parseImages = (images: string[] | null | undefined): string[] => {
    if (!images) return []
    if (Array.isArray(images)) {
      return images.filter((img): img is string => typeof img === 'string')
    }
    try {
      const parsed = typeof images === 'string' ? JSON.parse(images) : images
      return Array.isArray(parsed) ? parsed.filter((img): img is string => typeof img === 'string') : []
    } catch {
      return []
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse space-y-3 p-4 border border-slate-200 rounded-lg">
            <div className="h-4 bg-slate-200 rounded w-1/4" />
            <div className="h-4 bg-slate-200 rounded w-1/2" />
            <div className="h-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-slate-500 text-center py-8">
        Failed to load reviews. Please try again later.
      </div>
    )
  }

  if (reviews.length === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-8">
        No reviews yet. Be the first to review this product!
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          Customer Reviews ({reviews.length})
        </h3>
      </div>

      <div className="space-y-6">
        {reviews.map((review) => {
          const rating = parseRating(review.rating)
          const reviewImages = parseImages(review.images)
          const reviewVideos = parseImages(review.videos)
          const isHelpful = helpfulReviews.has(review.id)
          const helpfulCount = helpfulCounts[review.id] ?? parseInt(review.helpful_count || '0', 10)

          return (
            <div key={review.id} className="border-b border-slate-200 pb-6 last:border-b-0">
              {/* Reviewer Info and Rating */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
                      {review.reviewer_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{review.reviewer_name}</p>
                      <p className="text-xs text-slate-500">
                        Reviewed on {formatDate(review.created_at)}
                        {review.verified_purchase && (
                          <span className="ml-2 text-green-600 font-medium">✓ Verified Purchase</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      className={`w-4 h-4 ${
                        value <= rating
                          ? 'fill-orange-500 text-orange-500'
                          : 'fill-none text-slate-300'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Review Title */}
              {review.title && (
                <h4 className="font-semibold text-slate-900 mb-2">{review.title}</h4>
              )}

              {/* Review Content */}
              {review.content && (
                <p className="text-sm text-slate-700 mb-4 leading-relaxed">{review.content}</p>
              )}

              {/* Review Images */}
              {reviewImages.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-4 gap-2">
                    {reviewImages.map((imageUrl, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-lg overflow-hidden border border-slate-200"
                      >
                        <Image
                          src={imageUrl}
                          alt={`Review image ${idx + 1}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Videos */}
              {reviewVideos.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {reviewVideos.map((videoUrl, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                      >
                        <video
                          src={videoUrl}
                          controls
                          className="w-full h-full object-cover"
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Helpful and Report */}
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={() => handleHelpful(review.id)}
                  disabled={isHelpful}
                  className={`flex items-center gap-1 hover:text-green-600 transition-colors ${
                    isHelpful ? 'text-green-600 cursor-not-allowed' : ''
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>
                    {isHelpful
                      ? 'Helpful'
                      : helpfulCount > 0
                        ? `${helpfulCount} ${helpfulCount === 1 ? 'person' : 'people'} found this helpful`
                        : 'Helpful'}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-red-600 transition-colors"
                >
                  <Flag className="w-3 h-3" />
                  <span>Report</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ReviewsList

