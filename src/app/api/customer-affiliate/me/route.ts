import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * GET /api/customer-affiliate/me
 * Returns the customer-affiliate record for the signed-in customer (if any).
 *
 * Headers: x-customer-id (Medusa customer id)
 * Response: { is_affiliate: boolean, affiliate?: { refer_code, ... } }
 */
export async function GET(req: NextRequest) {
    const customerId = req.headers.get("x-customer-id")

    if (!customerId) {
        return NextResponse.json(
            { is_affiliate: false, message: "Not authenticated" },
            { status: 200 }
        )
    }

    if (!DATABASE_URL) {
        return NextResponse.json(
            { error: "Database configuration missing" },
            { status: 500 }
        )
    }

    const pool = new Pool({ connectionString: DATABASE_URL })

    try {
        const result = await pool.query(
            `SELECT id, customer_id, refer_code, email, name,
                    is_active, earned_coins, pending_coins, created_at
             FROM customer_referrer
             WHERE customer_id = $1
             LIMIT 1`,
            [customerId]
        )

        await pool.end()

        if (result.rows.length === 0) {
            return NextResponse.json({ is_affiliate: false })
        }

        const row = result.rows[0]
        return NextResponse.json({
            is_affiliate: true,
            affiliate: {
                id: row.id,
                customer_id: row.customer_id,
                refer_code: row.refer_code,
                email: row.email,
                name: row.name,
                is_active: row.is_active,
                earned_coins: parseFloat(row.earned_coins) || 0,
                pending_coins: parseFloat(row.pending_coins) || 0,
                created_at: row.created_at,
            },
        })
    } catch (error) {
        await pool.end().catch(() => { })
        console.error("[customer-affiliate/me] DB error:", error)
        return NextResponse.json(
            { error: "Database error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}
