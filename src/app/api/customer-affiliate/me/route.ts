import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/affiliate-pg"
import { cacheGet, cacheSet } from "@/lib/affiliate-cache"

export const dynamic = "force-dynamic"

/**
 * GET /api/customer-affiliate/me
 * Returns the customer-affiliate record for the signed-in customer (if any).
 *
 * Headers: x-customer-id (Medusa customer id)
 * Response: { is_affiliate: boolean, affiliate?: { refer_code, ... } }
 *
 * Cached per-customer for 30 seconds inside the warm Lambda. The cache is
 * invalidated by the /register route when the user becomes an affiliate.
 */
const CACHE_TTL_SECONDS = 30
const cacheKey = (customerId: string) => `affiliate:me:${customerId}`

type AffiliateMeResponse =
    | { is_affiliate: false; message?: string }
    | {
        is_affiliate: true
        affiliate: {
            id: string
            customer_id: string
            refer_code: string
            email: string | null
            name: string | null
            is_active: boolean
            earned_coins: number
            pending_coins: number
            created_at: string
        }
    }

export async function GET(req: NextRequest) {
    const customerId = req.headers.get("x-customer-id")

    if (!customerId) {
        return NextResponse.json(
            { is_affiliate: false, message: "Not authenticated" },
            { status: 200 }
        )
    }

    const cached = cacheGet<AffiliateMeResponse>(cacheKey(customerId))
    if (cached) {
        return NextResponse.json(cached, {
            headers: { "x-cache": "HIT" },
        })
    }

    try {
        const result = await query<{
            id: string
            customer_id: string
            refer_code: string
            email: string | null
            name: string | null
            is_active: boolean
            earned_coins: string | number
            pending_coins: string | number
            created_at: string
        }>(
            `SELECT id, customer_id, refer_code, email, name,
                    is_active, earned_coins, pending_coins, created_at
             FROM customer_referrer
             WHERE customer_id = $1
             LIMIT 1`,
            [customerId]
        )

        let payload: AffiliateMeResponse
        if (result.rows.length === 0) {
            payload = { is_affiliate: false }
        } else {
            const row = result.rows[0]
            payload = {
                is_affiliate: true,
                affiliate: {
                    id: row.id,
                    customer_id: row.customer_id,
                    refer_code: row.refer_code,
                    email: row.email,
                    name: row.name,
                    is_active: row.is_active,
                    earned_coins: parseFloat(String(row.earned_coins)) || 0,
                    pending_coins: parseFloat(String(row.pending_coins)) || 0,
                    created_at: row.created_at,
                },
            }
        }

        cacheSet(cacheKey(customerId), payload, CACHE_TTL_SECONDS)

        return NextResponse.json(payload, {
            headers: { "x-cache": "MISS" },
        })
    } catch (error) {
        console.error("[customer-affiliate/me] DB error:", error)
        const message = error instanceof Error ? error.message : String(error)

        const isMissingTable =
            /relation .*customer_referrer.* does not exist/i.test(message)
        const isConfigError = /DATABASE_URL not configured/i.test(message)

        return NextResponse.json(
            {
                error: isConfigError
                    ? "Database configuration missing"
                    : isMissingTable
                        ? "customer_referrer table missing — run create_customer_affiliate_tables.sql on the production database"
                        : "Database error",
                details: message,
            },
            { status: 500 }
        )
    }
}
