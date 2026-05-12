import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * GET /api/customer-affiliate/validate?code=XXX[&product_ids=p1,p2,...]
 *
 * Validates a customer-referrer affiliate code (the `customer_referrer.refer_code`).
 *
 * One-time-per-(customer, product, code) enforcement (when caller supplies
 * the customer):
 *   - Pass the current customer id either via `?customer_id=` or `x-customer-id`
 *     header. The endpoint will check which of the supplied `product_ids` the
 *     customer has already redeemed with this code (status PENDING or EARNED).
 *   - Returns:
 *       valid: false  if ANY product in `product_ids` was already redeemed
 *                     by this customer with this code,
 *       valid: true   otherwise (including when no `product_ids` are passed).
 *     The blocked product titles are returned in `already_used_products` so the
 *     UI can show a human-readable message ("You've already used this code on
 *     <Product Name>"). The user can still apply a DIFFERENT affiliate code on
 *     the same product, or this same code on a DIFFERENT product.
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

        // Intersect with the cart's product_ids — these are the ones we'll
        // refuse to apply against. Empty array means cart wasn't supplied or
        // there's no overlap.
        const blockedInCart =
            customerId && productIds.length > 0
                ? productIds.filter((p) => alreadyUsedProductIds.includes(p))
                : []

        // Resolve product titles for a friendlier error message. We keep this
        // best-effort — if the lookup fails we still return the IDs.
        let blockedProducts: { id: string; title: string | null }[] = []
        if (blockedInCart.length > 0) {
            try {
                const titlesRes = await pool.query(
                    `SELECT id, title FROM product WHERE id = ANY($1::text[])`,
                    [blockedInCart]
                )
                const titleById = new Map<string, string | null>(
                    titlesRes.rows.map((r: { id: string; title: string | null }) => [
                        r.id,
                        r.title,
                    ])
                )
                blockedProducts = blockedInCart.map((id) => ({
                    id,
                    title: titleById.get(id) ?? null,
                }))
            } catch (lookupErr) {
                console.warn(
                    "[customer-affiliate/validate] product title lookup failed",
                    lookupErr
                )
                blockedProducts = blockedInCart.map((id) => ({ id, title: null }))
            }
        }

        await pool.end()

        if (blockedInCart.length > 0) {
            const namedTitles = blockedProducts
                .map((p) => p.title)
                .filter((t): t is string => Boolean(t && t.trim()))

            let message: string
            if (namedTitles.length === 1) {
                message = `You've already used this affiliate code on "${namedTitles[0]}". Try a different affiliate code, or remove this product from your cart.`
            } else if (namedTitles.length > 1) {
                const list = namedTitles
                    .slice(0, 3)
                    .map((t) => `"${t}"`)
                    .join(", ")
                const more =
                    namedTitles.length > 3
                        ? ` and ${namedTitles.length - 3} more`
                        : ""
                message = `You've already used this affiliate code on ${list}${more}. Try a different affiliate code, or remove these products from your cart.`
            } else {
                message =
                    blockedInCart.length === 1
                        ? "You've already used this affiliate code on this product. Try a different affiliate code, or remove the product from your cart."
                        : "You've already used this affiliate code on some products in your cart. Try a different affiliate code, or remove those products from your cart."
            }

            return NextResponse.json({
                valid: false,
                message,
                already_used_product_ids: alreadyUsedProductIds,
                blocked_product_ids: blockedInCart,
                blocked_products: blockedProducts,
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
            blocked_product_ids: [],
            blocked_products: [],
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
