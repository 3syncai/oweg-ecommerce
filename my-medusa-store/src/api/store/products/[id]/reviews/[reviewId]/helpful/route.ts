import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  /* CORS allowlist via setAllowlistedCors or store middleware */ void 0
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  return res.status(200).end()
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  
  let client: Client | null = null
  
  try {
    const { id: productId, reviewId } = req.params
    if (!productId || !reviewId) {
      return res.status(400).json({ message: "Product ID and Review ID are required" })
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

    const result = await client.query(
      `UPDATE product_review
       SET helpful_count = (COALESCE(NULLIF(helpful_count, ''), '0')::bigint + 1)::text,
           updated_at = NOW()
       WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL AND status = 'approved'
       RETURNING helpful_count`,
      [reviewId, productId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" })
    }

    return res.json({
      message: "Review marked as helpful",
      helpful_count: result.rows[0].helpful_count,
    })
  } catch (error: any) {
    console.error("Error marking review as helpful:", error)
    return res.status(500).json({
      message: "Failed to mark review as helpful",
      error: error.message || "Unknown error",
    })
  } finally {
    if (client) {
      await client.end()
    }
  }
}

