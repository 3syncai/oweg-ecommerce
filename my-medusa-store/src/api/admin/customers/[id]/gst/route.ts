import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"
import { displayableGstin } from "../../../../../lib/customer-groups"

type GstDetails = {
  id: number | null
  customer_id: string | null
  gst_number: string | null
  gst_status: string | null
  business_name: string | null
  bank_name: string | null
  bank_branch_number: string | null
  bank_swift_code: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  created_at: string | null
  source?: string
}

function emptyGst(customerId: string): GstDetails {
  return {
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
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let client: Client | null = null

  try {
    const customerId = req.params.id

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" })
    }

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }

    client = new Client({ connectionString: databaseUrl })
    await client.connect()

    const tableResult = await client.query(
      `SELECT
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
      LIMIT 1`,
      [customerId]
    )

    const customerResult = await client.query(
      `SELECT company_name, gst_number, customer_type, metadata
       FROM customer
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [customerId]
    )
    const customer = customerResult.rows[0] as
      | {
          company_name?: string | null
          gst_number?: string | null
          customer_type?: string | null
          metadata?: Record<string, unknown> | null
        }
      | undefined

    const meta = customer?.metadata || {}
    const fallbackGst = displayableGstin(
      customer?.gst_number,
      typeof meta.gst_number === "string" ? meta.gst_number : null,
      tableResult.rows[0]?.gst_number
    )
    const fallbackCompany =
      (typeof customer?.company_name === "string" &&
        customer.company_name.trim()) ||
      (typeof meta.company_name === "string" && meta.company_name.trim()) ||
      (typeof tableResult.rows[0]?.business_name === "string" &&
        tableResult.rows[0].business_name.trim()) ||
      null

    let gstDetails: GstDetails

    if (tableResult.rows?.length > 0) {
      const row = tableResult.rows[0]
      const tableGst = displayableGstin(row.gst_number)
      gstDetails = {
        ...row,
        gst_number: tableGst || fallbackGst,
        business_name:
          (typeof row.business_name === "string" && row.business_name.trim()) ||
          fallbackCompany,
        source: tableGst ? "customer_gst" : "customer_fallback",
      }

      // Heal empty customer_gst row from customer columns
      if ((!tableGst || !row.business_name) && fallbackGst && fallbackCompany) {
        await client.query(
          `UPDATE customer_gst
           SET gst_number = COALESCE(NULLIF(TRIM(gst_number), ''), $2),
               business_name = COALESCE(NULLIF(TRIM(business_name), ''), $3),
               gst_status = COALESCE(gst_status, 'active')
           WHERE id = $1`,
          [row.id, fallbackGst, fallbackCompany]
        )
        gstDetails.gst_number = fallbackGst
        gstDetails.business_name = fallbackCompany
        gstDetails.gst_status = row.gst_status || "active"
        gstDetails.source = "healed"
      }
    } else if (fallbackGst || fallbackCompany) {
      // No customer_gst row — create one so the widget stays populated
      if (fallbackGst && fallbackCompany) {
        const inserted = await client.query(
          `INSERT INTO customer_gst (customer_id, gst_number, business_name, gst_status, created_at)
           VALUES ($1, $2, $3, 'active', NOW())
           RETURNING id, customer_id, gst_number, gst_status, business_name,
                     bank_name, bank_branch_number, bank_swift_code,
                     bank_account_name, bank_account_number, created_at`,
          [customerId, fallbackGst, fallbackCompany]
        )
        gstDetails = { ...inserted.rows[0], source: "created_from_customer" }
      } else {
        gstDetails = {
          ...emptyGst(customerId),
          gst_number: fallbackGst,
          business_name: fallbackCompany,
          gst_status: fallbackGst ? "active" : null,
          source: "customer_fallback",
        }
      }
    } else {
      gstDetails = emptyGst(customerId)
    }

    return res.status(200).json({ gst_details: gstDetails })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("GST API error:", err)
    return res.status(500).json({
      message: "Server Error",
      error: message,
    })
  } finally {
    if (client) {
      await client.end().catch(console.error)
    }
  }
}
