import { NextRequest, NextResponse } from "next/server"
import { getAffiliatePool } from "@/lib/affiliate-pg"
import { adminFetch } from "@/lib/medusa-admin"
import { authorizeReferralCustomer } from "@/lib/referral-auth"

export const dynamic = "force-dynamic"

/** Save the verified customer's agent referral once; never overwrite attribution. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    customer_id?: unknown; referral_code?: unknown; affiliate_code?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  const auth = await authorizeReferralCustomer(req, [body.customer_id])
  if (auth.error) return auth.error
  const customerId = auth.customer!.id
  const rawCode = body.referral_code ?? body.affiliate_code
  if (typeof rawCode !== "string" || !rawCode.trim()) {
    return NextResponse.json({ error: "referral_code required" }, { status: 400 })
  }
  const code = rawCode.trim().toUpperCase()

  try {
    const client = await getAffiliatePool().connect()
    try {
      await client.query("BEGIN")
      // Serialize competing choices for one customer, including the initial insert.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [customerId])
      const existing = await client.query(
        "SELECT referral_code FROM customer_referral WHERE customer_id = $1", [customerId]
      )
      if (existing.rows[0] && existing.rows[0].referral_code !== code) {
        await client.query("ROLLBACK")
        return NextResponse.json({ success: false, locked: true, message: "Referral code is already saved and cannot be changed." }, { status: 409 })
      }
      const validCode = await client.query(
        `SELECT id::text AS id FROM affiliate_user WHERE UPPER(refer_code) = $1 AND is_approved = TRUE
         UNION SELECT id::text AS id FROM branch_admin WHERE UPPER(refer_code) = $1
         UNION SELECT id::text AS id FROM area_sales_manager WHERE UPPER(refer_code) = $1
         UNION SELECT id::text AS id FROM state_admin WHERE UPPER(refer_code) = $1 LIMIT 1`, [code]
      )
      if (!validCode.rows.length) {
        await client.query("ROLLBACK")
        return NextResponse.json({ success: false, message: "Invalid referral code." }, { status: 400 })
      }
      await client.query(
        `INSERT INTO customer_referral (customer_id, referral_code, created_at)
         VALUES ($1, $2, NOW()) ON CONFLICT (customer_id) DO NOTHING`, [customerId, code]
      )
      // A concurrent registration path can insert without the advisory lock.
      // Read the canonical row before writing any attribution or metadata.
      const saved = await client.query(
        "SELECT referral_code FROM customer_referral WHERE customer_id = $1", [customerId]
      )
      if (saved.rows[0]?.referral_code !== code) {
        await client.query("ROLLBACK")
        return NextResponse.json({ success: false, locked: true, message: "Referral code is already saved and cannot be changed." }, { status: 409 })
      }
      const customer = await client.query(
        "SELECT email, first_name, last_name FROM customer WHERE id = $1", [customerId]
      )
      const profile = customer.rows[0] || auth.customer!
      const affiliate = await client.query(
        "SELECT id FROM affiliate_user WHERE UPPER(refer_code) = $1", [code]
      )
      await client.query(
        `INSERT INTO affiliate_referrals (affiliate_code, affiliate_user_id, customer_id, customer_email, customer_name)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (SELECT 1 FROM affiliate_referrals WHERE customer_id = $3)`,
        [code, affiliate.rows[0]?.id || null, customerId, profile.email || null,
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null]
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }

    // Metadata is a best-effort mirror; the locked database row is authoritative.
    try {
      const path = `/admin/customers/${encodeURIComponent(customerId)}`
      const current = await adminFetch<{ customer?: { metadata?: Record<string, unknown> } }>(path)
      if (current.ok) {
        const result = await adminFetch(path, {
          method: "POST",
          body: JSON.stringify({ metadata: { ...(current.data?.customer?.metadata || {}), referral_code: code } }),
        })
        if (!result.ok) console.warn("[save-referral] metadata sync failed", result.status)
      }
    } catch {
      console.warn("[save-referral] metadata sync unavailable")
    }
    return NextResponse.json({ success: true, locked: true, referral_code: code, message: "Referral saved and locked" })
  } catch {
    return NextResponse.json({ error: "Unable to save referral" }, { status: 500 })
  }
}
