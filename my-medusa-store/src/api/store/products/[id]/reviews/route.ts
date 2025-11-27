import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  return res.status(200).end()
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  
  let client: Client | null = null
  
  try {
    const { id: productId } = req.params
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" })
    }

    // Get database URL from environment
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }

    // Create PostgreSQL client
    client = new Client({
      connectionString: databaseUrl,
    })
    
    await client.connect()

    // Query reviews from database - show approved reviews and pending reviews
    // (pending reviews will be visible to users who submitted them)
    const result = await client.query(
      `SELECT * FROM product_review 
       WHERE product_id = $1 
       AND deleted_at IS NULL 
       AND (status = 'approved' OR status = 'pending')
       ORDER BY created_at DESC`,
      [productId]
    )

    console.log(`Found ${result.rows.length} reviews for product ${productId}`)

    // Parse JSON fields (images, videos) from database
    const reviews = (result.rows || []).map((review: any) => {
      try {
        if (review.images && typeof review.images === 'string') {
          review.images = JSON.parse(review.images)
        } else if (!review.images) {
          review.images = []
        }
        if (review.videos && typeof review.videos === 'string') {
          review.videos = JSON.parse(review.videos)
        } else if (!review.videos) {
          review.videos = []
        }
      } catch (e) {
        console.error('Error parsing review images/videos:', e)
        // If parsing fails, set to empty array
        review.images = []
        review.videos = []
      }
      return review
    })

    console.log(`Returning ${reviews.length} parsed reviews`)
    return res.json({ reviews })
  } catch (error: any) {
    console.error("Error fetching reviews:", error)
    return res.status(500).json({
      message: "Failed to fetch reviews",
      error: error.message || "Unknown error",
    })
  } finally {
    if (client) {
      await client.end()
    }
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  
  let client: Client | null = null
  
  try {
    const { id: productId } = req.params
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" })
    }

    const body = (req as any).body || {}
    const { title, content, rating, images, videos, reviewer_name, reviewer_email } = body

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Review title is required" })
    }

    if (!rating) {
      return res.status(400).json({ message: "Rating is required" })
    }

    // Get database URL from environment
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }

    // Create PostgreSQL client
    client = new Client({
      connectionString: databaseUrl,
    })
    
    await client.connect()

    // Generate review ID
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Get customer ID from auth if available
    const customerId = (req as any).auth_context?.actor_id || null

    // Insert review into database
    await client.query(
      `INSERT INTO product_review (
        id, product_id, customer_id, reviewer_name, reviewer_email,
        title, content, rating, images, videos, 
        verified_purchase, helpful_count, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        reviewId,
        productId,
        customerId,
        reviewer_name || 'Anonymous',
        reviewer_email || null,
        title.trim(),
        content || '',
        rating.toString(),
        images ? JSON.stringify(images) : null,
        videos ? JSON.stringify(videos) : null,
        false, // verified_purchase
        '0', // helpful_count
        'approved', // status - auto-approve reviews for immediate display
      ]
    )

    return res.json({
      message: "Review submitted successfully",
      review: {
        id: reviewId,
        product_id: productId,
        title,
        rating,
        status: 'pending',
      },
    })
  } catch (error: any) {
    console.error("Error creating review:", error)
    return res.status(500).json({
      message: "Failed to create review",
      error: error.message || "Unknown error",
    })
  } finally {
    if (client) {
      await client.end()
    }
  }
}

