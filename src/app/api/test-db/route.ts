import { NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

/**
 * GET /api/test-db
 * Diagnostic endpoint. Use this to confirm which database the deployed app
 * is actually connecting to and whether the customer_referrer schema exists.
 *
 * Safe to expose — it does not return credentials, only the host/db name.
 */
export async function GET() {
    const dbUrlRaw = process.env.DATABASE_URL

    if (!dbUrlRaw) {
        return NextResponse.json(
            {
                success: false,
                error: "DATABASE_URL not set in environment variables",
            },
            { status: 500 }
        )
    }

    // Parse the URL so we can show the user which host/db is in use,
    // without ever leaking the password.
    let connectionInfo: {
        host: string
        port: string
        database: string
        user: string
        sslmode: string | null
    } = {
        host: "unknown",
        port: "unknown",
        database: "unknown",
        user: "unknown",
        sslmode: null,
    }
    try {
        const u = new URL(dbUrlRaw)
        connectionInfo = {
            host: u.hostname,
            port: u.port || "5432",
            database: u.pathname.replace(/^\//, ""),
            user: u.username,
            sslmode: u.searchParams.get("sslmode"),
        }
    } catch {
        // ignore parse errors
    }

    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(
        connectionInfo.host
    )
    const pool = new Pool({
        connectionString: dbUrlRaw,
        ssl:
            !isLocal && process.env.PGSSLMODE !== "disable"
                ? { rejectUnauthorized: false }
                : undefined,
        connectionTimeoutMillis: 8_000,
    })

    try {
        const time = await pool.query<{ now: string }>("SELECT NOW() as now")

        // Confirm we're really on the DB the user thinks we are
        const dbInfo = await pool.query<{
            current_database: string
            current_user: string
            current_schema: string
            inet_server_addr: string | null
        }>(
            `SELECT current_database(), current_user, current_schema(),
                    inet_server_addr()::text AS inet_server_addr`
        )

        // Check whether the affiliate tables actually exist on this DB
        const tables = await pool.query<{
            table_name: string
        }>(
            `SELECT table_name
               FROM information_schema.tables
              WHERE table_schema = current_schema()
                AND table_name IN (
                  'customer_referrer',
                  'customer_referrer_referrals',
                  'customer_referrer_coins_log'
                )
              ORDER BY table_name`
        )

        const found = tables.rows.map((r) => r.table_name)
        const missing = [
            "customer_referrer",
            "customer_referrer_referrals",
            "customer_referrer_coins_log",
        ].filter((t) => !found.includes(t))

        await pool.end()

        return NextResponse.json({
            success: true,
            connection: {
                host: connectionInfo.host,
                port: connectionInfo.port,
                database: connectionInfo.database,
                user: connectionInfo.user,
                sslmode: connectionInfo.sslmode,
            },
            server: {
                current_database: dbInfo.rows[0].current_database,
                current_user: dbInfo.rows[0].current_user,
                current_schema: dbInfo.rows[0].current_schema,
                inet_server_addr: dbInfo.rows[0].inet_server_addr,
                now: time.rows[0].now,
            },
            customer_referrer_tables: {
                found,
                missing,
                ok: missing.length === 0,
            },
        })
    } catch (err) {
        await pool.end().catch(() => { })
        return NextResponse.json(
            {
                success: false,
                connection: {
                    host: connectionInfo.host,
                    port: connectionInfo.port,
                    database: connectionInfo.database,
                    user: connectionInfo.user,
                    sslmode: connectionInfo.sslmode,
                },
                error: "Database connection or query failed",
                details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        )
    }
}
