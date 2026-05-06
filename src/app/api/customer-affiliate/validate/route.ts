import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * GET /api/customer-affiliate/validate?code=XXX[&product_ids=p1,p2,...]
 *
 * Validates a customer-referrer affiliate code (the `customer_referrer.refer_code`).
 *
 * One-time-per-product enforcement (when caller supplies the customer):
 *   - Pass the current customer id either via `?customer_id=` or `x-customer-id`
 *     header. The endpoint will check which of the supplied `product_ids` the
 *     customer has already redeemed with this code (status PENDING or EARNED).
 *   - Returns:
 *       valid: false  if EVERY product in `product_ids` has already been used,
 *       valid: true   otherwise (including when no `product_ids` are passed),
 *     and always returns `already_used_product_ids` so the UI can surface a
 *     clear message about which products won't earn a second time.
 *
 * Independent from the existing /api/store/validate-referral endpoint — that one
 * checks the agent-side `affiliate_user` / `branch_admin` / etc. tables and is
 * left untouched.
 */
export async function GET(req: NextRequest) {
    const code = (req.nextUrl.searchParams.get("code") || "").trim()
    const productIdsParam = req.nextUrl.searchParams.get("product_ids") || ""
    const productIds = productIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const customerId =
        (req.headers.get("x-customer-id") || "").trim() ||
        (req.nextUrl.searchParams.get("customer_id") || "").trim()

    if (!code) {
        return NextResponse.json(
            { valid: false, message: "Code required" },
            { status: 400 }
        )
    }

    if (!DATABASE_URL) {
        return NextResponse.json(
            { valid: false, error: "Database configuration missing" },
            { status: 500 }
        )
    }

    const pool = new Pool({ connectionString: DATABASE_URL })

    try {
        const result = await pool.query(
            `SELECT customer_id, refer_code, name, email, is_active
             FROM customer_referrer
             WHERE UPPER(refer_code) = UPPER($1)
             LIMIT 1`,
            [code]
        )

        if (result.rows.length === 0) {
            await pool.end()
            return NextResponse.json({
                valid: false,
                message: "Affiliate code not found.",
            })
        }

        const row = result.rows[0]
        if (row.is_active === false) {
            await pool.end()
            return NextResponse.json({
                valid: false,
                message: "This affiliate code is no longer active.",
            })
        }

        if (customerId && row.customer_id === customerId) {
            await pool.end()
            return NextResponse.json({
                valid: false,
                message: "You can't use your own affiliate code.",
            })
        }

        let alreadyUsedProductIds: string[] = []
        if (customerId) {
            const usedRes = await pool.query(
                `SELECT DISTINCT product_id
                   FROM customer_referrer_coins_log
                  WHERE referred_customer_id = $1
                    AND UPPER(refer_code) = UPPER($2)
                    AND product_id IS NOT NULL
                    AND status IN ('PENDING', 'EARNED')`,
                [customerId, row.refer_code]
            )
            alreadyUsedProductIds = usedRes.rows
                .map((r: { product_id: string }) => r.product_id)
                .filter(Boolean)
        }

        await pool.end()

        const allBlocked =
            customerId &&
            productIds.length > 0 &&
            productIds.every((p) => alreadyUsedProductIds.includes(p))

        if (allBlocked) {
            return NextResponse.json({
                valid: false,
                message:
                    productIds.length === 1
                        ? "You've already used this affiliate code on this product."
                        : "You've already used this affiliate code on every product in your cart.",
                already_used_product_ids: alreadyUsedProductIds,
                refer_code: row.refer_code,
                affiliate_customer_id: row.customer_id,
            })
        }

        return NextResponse.json({
            valid: true,
            refer_code: row.refer_code,
            affiliate_name: row.name || "OWEG Affiliate",
            affiliate_customer_id: row.customer_id,
            already_used_product_ids: alreadyUsedProductIds,
        })
    } catch (error) {
        await pool.end().catch(() => { })
        console.error("[customer-affiliate/validate] DB error:", error)
        return NextResponse.json(
            {
                valid: false,
                error: "Database error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}
