import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randomCode(length = 6): string {
    let out = ""
    for (let i = 0; i < length; i++) {
        out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    return out
}

async function isCodeUnique(pool: Pool, code: string): Promise<boolean> {
    // Check across both the new customer-affiliate table and the existing
    // affiliate_user table so codes never collide between systems.
    const a = await pool.query(
        `SELECT 1 FROM customer_referrer WHERE UPPER(refer_code) = UPPER($1) LIMIT 1`,
        [code]
    )
    if (a.rows.length) return false

    try {
        const b = await pool.query(
            `SELECT 1 FROM affiliate_user WHERE UPPER(refer_code) = UPPER($1) LIMIT 1`,
            [code]
        )
        if (b.rows.length) return false
    } catch {
        // affiliate_user table may not exist in some environments; treat as unique
    }

    return true
}

/**
 * POST /api/customer-affiliate/register
 * Promotes the signed-in customer into a customer-affiliate by issuing
 * a unique referral code. Idempotent — calling twice returns the same record.
 *
 * Body: { customer_id, email?, name? }
 */
export async function POST(req: NextRequest) {
    if (!DATABASE_URL) {
        return NextResponse.json(
            { error: "Database configuration missing" },
            { status: 500 }
        )
    }

    let body: { customer_id?: string; email?: string; name?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const customerId = body.customer_id || req.headers.get("x-customer-id")
    if (!customerId) {
        return NextResponse.json(
            { error: "Not authenticated. Please sign in first." },
            { status: 401 }
        )
    }

    const pool = new Pool({ connectionString: DATABASE_URL })

    try {
        // Idempotent: if the customer already became an affiliate, return existing
        const existing = await pool.query(
            `SELECT id, customer_id, refer_code, email, name,
                    earned_coins, pending_coins, created_at
             FROM customer_referrer
             WHERE customer_id = $1
             LIMIT 1`,
            [customerId]
        )

        if (existing.rows.length > 0) {
            const row = existing.rows[0]
            await pool.end()
            return NextResponse.json({
                success: true,
                already_registered: true,
                affiliate: {
                    id: row.id,
                    customer_id: row.customer_id,
                    refer_code: row.refer_code,
                    email: row.email,
                    name: row.name,
                    earned_coins: parseFloat(row.earned_coins) || 0,
                    pending_coins: parseFloat(row.pending_coins) || 0,
                    created_at: row.created_at,
                },
            })
        }

        // Generate a unique referral code (with retries to guard against collisions)
        let code = ""
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = `OWG${randomCode(5)}`
            // eslint-disable-next-line no-await-in-loop
            if (await isCodeUnique(pool, candidate)) {
                code = candidate
                break
            }
        }

        if (!code) {
            await pool.end()
            return NextResponse.json(
                { error: "Could not generate a unique referral code. Try again." },
                { status: 500 }
            )
        }

        const insert = await pool.query(
            `INSERT INTO customer_referrer (customer_id, refer_code, email, name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, customer_id, refer_code, email, name,
                       earned_coins, pending_coins, created_at`,
            [customerId, code, body.email || null, body.name || null]
        )

        await pool.end()

        const row = insert.rows[0]
        return NextResponse.json({
            success: true,
            already_registered: false,
            affiliate: {
                id: row.id,
                customer_id: row.customer_id,
                refer_code: row.refer_code,
                email: row.email,
                name: row.name,
                earned_coins: parseFloat(row.earned_coins) || 0,
                pending_coins: parseFloat(row.pending_coins) || 0,
                created_at: row.created_at,
            },
        })
    } catch (error) {
        await pool.end().catch(() => { })
        console.error("[customer-affiliate/register] DB error:", error)
        return NextResponse.json(
            {
                error: "Database error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}
