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

    // Get current helpful count
    const currentResult = await client.query(
      `SELECT helpful_count FROM product_review WHERE id = $1`,
      [reviewId]
    )

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" })
    }

    const currentCount = parseInt(currentResult.rows[0].helpful_count || '0', 10)
    const newCount = (currentCount + 1).toString()

    // Update helpful count
    await client.query(
      `UPDATE product_review 
       SET helpful_count = $1, updated_at = NOW() 
       WHERE id = $2`,
      [newCount, reviewId]
    )

    return res.json({
      message: "Review marked as helpful",
      helpful_count: newCount,
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

