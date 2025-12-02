"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Product = {
  id: string
  title: string
  images?: Array<{ url: string }>
  metadata?: {
    videos?: Array<{
      url: string
      key: string
      filename: string
    }>
    [key: string]: any
  }
}

const MediaVideosSection = ({ data }: { data?: { product?: Product } }) => {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Try to get product from widget data first
    if (data?.product) {
      setProduct(data.product)
      setLoading(false)
      return
    }

    // Fallback: Extract product ID from URL
    const path = window.location.pathname
    const productIdMatch = path.match(/\/products\/([^\/]+)/)
    const productId = productIdMatch ? productIdMatch[1] : null

    if (!productId) {
      setLoading(false)
      return
    }

    // Fetch product data from API
    const fetchProduct = async () => {
      try {
        const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
        const response = await fetch(`${backend}/admin/products/${productId}`, {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          const result = await response.json()
          setProduct(result.product || result)
        }
      } catch (error) {
        console.error("Failed to fetch product for videos:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [data])

  // Extract videos from metadata or from images array (videos that end with video extensions)
  const videos: Array<{ url: string; filename?: string }> = []
  
  if (product) {
    // First, check metadata for videos
    if (product.metadata?.videos && Array.isArray(product.metadata.videos)) {
      product.metadata.videos.forEach((video: any) => {
        if (video.url) {
          videos.push({
            url: video.url,
            filename: video.filename || video.url.split('/').pop() || 'video'
          })
        }
      })
    }
    
    // Also check images array for video URLs (videos we added to images array)
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach((img: any) => {
        const url = typeof img === 'string' ? img : img.url
        if (url && /\.(mp4|webm|mov|avi|mkv|ogg|wmv|flv)(\?|$)/i.test(url)) {
          // Check if not already in videos array
          if (!videos.some(v => v.url === url)) {
            videos.push({
              url: url,
              filename: url.split('/').pop() || 'video'
            })
          }
        }
      })
    }
  }

  if (loading || videos.length === 0) {
    return null
  }

  // Style to match Medusa's Media section exactly
  return (
    <div style={{ 
      padding: "24px",
      background: "var(--bg-base)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      marginTop: "24px",
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div>
          <Heading level="h2" style={{ marginBottom: 4, fontSize: "16px", fontWeight: 500 }}>
            Videos
          </Heading>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            {videos.length} {videos.length === 1 ? 'video' : 'videos'} uploaded by vendor
          </Text>
        </div>
      </div>
      
      {/* Display videos in a grid matching Media section style */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 12,
      }}>
        {videos.map((video: any, index: number) => (
          <div
            key={index}
            style={{
              position: "relative",
              aspectRatio: "1",
              borderRadius: "8px",
              overflow: "hidden",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-base)",
              cursor: "pointer",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.02)"
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)"
              e.currentTarget.style.boxShadow = "none"
            }}
            onClick={() => {
              // Open video in a modal or new tab
              window.open(video.url, '_blank')
            }}
          >
            {/* Video thumbnail/preview */}
            <div style={{ 
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-base)",
            }}>
              {/* Video icon overlay */}
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.4)",
                zIndex: 1,
                transition: "background 0.2s",
              }}>
                <svg 
                  width="32" 
                  height="32" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  style={{ color: "white" }}
                >
                  <path 
                    d="M8 5v14l11-7z" 
                    fill="currentColor"
                  />
                </svg>
              </div>
              
              {/* Video preview thumbnail */}
              <video
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                src={video.url}
                preload="metadata"
                muted
              />
            </div>
            
            {/* Video label overlay */}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
              padding: "8px",
              zIndex: 2,
            }}>
              <Text size="xsmall" style={{ 
                color: "white",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {video.filename || `Video ${index + 1}`}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default MediaVideosSection

