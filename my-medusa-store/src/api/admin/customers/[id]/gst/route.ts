import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let client: Client | null = null
  
  try {
    const customerId = req.params.id

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" })
    }

    // Get database URL from environment or use direct connection
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }

    // Create PostgreSQL client
    client = new Client({
      connectionString: databaseUrl,
    })
    
    await client.connect()

    const sql = `
      SELECT 
        id,
        customer_id,
        gst_number,
        gst_status,
        business_name,
        bank_name,
        bank_branch_number,
        bank_swift_code,
        bank_account_name,
        bank_account_number,
        created_at
      FROM customer_gst
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `

    // Execute raw SQL query
    const result = await client.query(sql, [customerId])

    // If row exists → return row (even if columns are null)
    if (result.rows && result.rows.length > 0) {
      return res.status(200).json({
        gst_details: result.rows[0],
      })
    }

    // If no row exists → return empty structure
    return res.status(200).json({
      gst_details: {
        id: null,
        customer_id: customerId,
        gst_number: null,
        gst_status: null,
        business_name: null,
        bank_name: null,
        bank_branch_number: null,
        bank_swift_code: null,
        bank_account_name: null,
        bank_account_number: null,
        created_at: null,
      },
    })
  } catch (err: any) {
    console.error("GST API error:", err)
    return res.status(500).json({
      message: "Server Error",
      error: err?.message || String(err),
    })
  } finally {
    // Always close the connection
    if (client) {
      await client.end().catch(console.error)
    }
  }
}
