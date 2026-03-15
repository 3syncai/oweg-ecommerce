import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

/**
 * GET /api/store/validate-referral?code=OWEGXXX
 * Validates whether a referral code exists in the system.
 * Returns the agent name on success so the UI can show a confirmation.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")?.trim().toUpperCase()

    if (!code) {
        return NextResponse.json({ valid: false, message: "No code provided" }, { status: 400 })
    }

    if (!process.env.DATABASE_URL) {
        console.error("[validate-referral] DATABASE_URL missing")
        return NextResponse.json({ valid: false, message: "Server configuration error" }, { status: 500 })
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })

    try {
        // Check affiliate_user first
        const affiliateResult = await pool.query(
            `SELECT first_name, last_name FROM affiliate_user 
             WHERE UPPER(refer_code) = $1 AND is_approved = TRUE
             LIMIT 1`,
            [code]
        )

        if (affiliateResult.rows.length > 0) {
            const user = affiliateResult.rows[0]
            await pool.end()
            return NextResponse.json({
                valid: true,
                agent_name: `${user.first_name} ${user.last_name}`.trim(),
                type: "agent"
            })
        }

        // Also check branch_admin 
        const branchResult = await pool.query(
            `SELECT first_name, last_name FROM branch_admin 
             WHERE UPPER(refer_code) = $1
             LIMIT 1`,
            [code]
        )

        if (branchResult.rows.length > 0) {
            const user = branchResult.rows[0]
            await pool.end()
            return NextResponse.json({
                valid: true,
                agent_name: `${user.first_name} ${user.last_name}`.trim(),
                type: "branch_admin"
            })
        }

        // Check ASM (Area Sales Manager)
        const asmResult = await pool.query(
            `SELECT first_name, last_name FROM area_sales_manager 
             WHERE UPPER(refer_code) = $1
             LIMIT 1`,
            [code]
        )

        if (asmResult.rows.length > 0) {
            const user = asmResult.rows[0]
            await pool.end()
            return NextResponse.json({
                valid: true,
                agent_name: `${user.first_name} ${user.last_name}`.trim(),
                type: "asm"
            })
        }

        // Check State Admin
        const stateAdminResult = await pool.query(
            `SELECT first_name, last_name FROM state_admin 
             WHERE UPPER(refer_code) = $1
             LIMIT 1`,
            [code]
        )

        if (stateAdminResult.rows.length > 0) {
            const user = stateAdminResult.rows[0]
            await pool.end()
            return NextResponse.json({
                valid: true,
                agent_name: `${user.first_name} ${user.last_name}`.trim(),
                type: "state_admin"
            })
        }

        await pool.end()
        return NextResponse.json({ valid: false, message: "Referral code not found" })

    } catch (error) {
        console.error("[validate-referral] DB error:", error)
        await pool.end().catch(() => { })
        return NextResponse.json({ valid: false, message: "Failed to validate code" }, { status: 500 })
    }
}
