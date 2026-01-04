'use client'

import React, { useState, useRef } from 'react'
import { Star, X, Camera, Upload, LogIn } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthProvider'

type ReviewFormProps = {
  productId: string
  productName: string
  productImage?: string
  onSubmitSuccess?: () => void
}

const ReviewForm = ({ productId, productName, productImage, onSubmitSuccess }: ReviewFormProps) => {
  const { customer } = useAuth()
  const [rating, setRating] = useState<number>(0)
  const [hoveredRating, setHoveredRating] = useState<number>(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewTitle, setReviewTitle] = useState('')
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [uploadedVideos, setUploadedVideos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleStarClick = (value: number) => {
    setRating(value)
  }

  const handleStarHover = (value: number) => {
    setHoveredRating(value)
  }

  const handleStarLeave = () => {
    setHoveredRating(0)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => {
        formData.append('files', file)
      })
      formData.append('productId', productId)
      formData.append('productName', productName)

      const response = await fetch(`/api/medusa/products/${productId}/reviews/upload-media`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to upload images')
      }

      const data = await response.json()
      const uploadedFiles = data.files || []
      
      // Separate images and videos based on file extension
      const imageUrls: string[] = []
      const videoUrls: string[] = []
      
      uploadedFiles.forEach((file: { url: string; key?: string; filename?: string }) => {
        const url = file.url || file.key
        if (url) {
          // Check if it's a video by extension
          const filename = (file.filename || file.key || url).toLowerCase()
          const isVideo = /\.(mp4|mov|avi|webm|mkv|mpeg|mpg|flv|wmv|3gp)$/i.test(url) ||
                         /\.(mp4|mov|avi|webm|mkv|mpeg|mpg|flv|wmv|3gp)$/i.test(filename)
          
          if (isVideo) {
            videoUrls.push(url)
          } else {
            imageUrls.push(url)
          }
        }
      })
      
      if (imageUrls.length > 0) {
        setUploadedImages((prev) => [...prev, ...imageUrls])
      }
      if (videoUrls.length > 0) {
        setUploadedVideos((prev) => [...prev, ...videoUrls])
      }
      
      const totalUploaded = imageUrls.length + videoUrls.length
      if (totalUploaded > 0) {
        toast.success(`${totalUploaded} file${totalUploaded > 1 ? 's' : ''} uploaded successfully`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Please try again'
      toast.error('Failed to upload images', {
        description: errorMessage,
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveVideo = (index: number) => {
    setUploadedVideos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!reviewTitle.trim()) {
      toast.error('Please enter a review title')
      return
    }

    if (rating === 0) {
      toast.error('Please select a rating')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/medusa/products/${productId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: reviewTitle,
          content: reviewText,
          rating: rating.toString(),
          images: uploadedImages.length > 0 ? uploadedImages : null,
          videos: uploadedVideos.length > 0 ? uploadedVideos : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to submit review')
      }

      toast.success('Review submitted successfully!')
      
      // Reset form
      setRating(0)
      setReviewText('')
      setReviewTitle('')
      setUploadedImages([])
      setUploadedVideos([])
      
      if (onSubmitSuccess) {
        onSubmitSuccess()
      }
    } catch (error) {
      console.error('Submit error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Please try again'
      toast.error('Failed to submit review', {
        description: errorMessage,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoveredRating || rating

  // Show login prompt if user is not logged in
  if (!customer) {
    return (
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <LogIn className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Sign in to write a review</h3>
            <p className="text-sm text-slate-600 mb-4">
              You need to be signed in to share your experience with this product.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Product Info */}
      <div className="flex items-start gap-4">
        {productImage && (
          <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900 mb-1">How was the item?</h3>
          <p className="text-sm text-slate-600">{productName}</p>
        </div>
      </div>

      {/* Star Rating */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleStarClick(value)}
              onMouseEnter={() => handleStarHover(value)}
              onMouseLeave={handleStarLeave}
              className="focus:outline-none"
              aria-label={`Rate ${value} stars`}
            >
              <Star
                className={`w-6 h-6 transition-colors ${
                  value <= displayRating
                    ? 'fill-orange-500 text-orange-500'
                    : 'fill-none text-slate-300'
                }`}
              />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <button
            type="button"
            onClick={() => setRating(0)}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Write a review */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Write a review</h4>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="What should other customers know?"
            className="w-full min-h-[120px] px-4 py-3 border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-slate-900"
            rows={4}
          />
        </div>

        {/* Share a video or photo */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Share a video or photo</h4>
          <div className="space-y-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-green-500 transition-colors bg-slate-50 hover:bg-green-50/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-600">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="relative w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-slate-500" />
                    <Upload className="w-4 h-4 text-slate-500 absolute -bottom-1 -right-1" />
                  </div>
                  <p className="text-sm text-slate-600">Click to upload photos or videos</p>
                </div>
              )}
            </div>

            {/* Uploaded Images Preview */}
            {uploadedImages.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-2">Uploaded Images:</p>
                <div className="grid grid-cols-4 gap-3">
                  {uploadedImages.map((url, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <Image
                        src={url}
                        alt={`Upload ${index + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded Videos Preview */}
            {uploadedVideos.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Uploaded Videos:</p>
                <div className="grid grid-cols-2 gap-3">
                  {uploadedVideos.map((url, index) => (
                    <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group">
                      <video
                        src={url}
                        controls
                        className="w-full h-full object-cover"
                      >
                        Your browser does not support the video tag.
                      </video>
                      <button
                        type="button"
                        onClick={() => handleRemoveVideo(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        aria-label="Remove video"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Title your review */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">
            Title your review <span className="text-red-500">(required)</span>
          </h4>
          <input
            type="text"
            value={reviewTitle}
            onChange={(e) => setReviewTitle(e.target.value)}
            placeholder="What's most important to know?"
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-slate-900"
            required
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !reviewTitle.trim() || rating === 0}
            className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ReviewForm

