import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { resolveAuthenticatedCustomerId } from "@/lib/store-customer-auth";

export const dynamic = "force-dynamic";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * GET /api/store/wallet/expiring
 *
 * Get detailed info about coins expiring soon for a customer
 * Shows coins expiring in the next 30 days with breakdown
 */
export async function GET(req: NextRequest) {
  try {
    const { customerId, forbidden } = await resolveAuthenticatedCustomerId(req);

    if (forbidden) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!customerId) {
      return NextResponse.json({
        expiring_soon: 0,
        coins_expiring: [],
        message: "Authentication required",
      });
    }

    if (!DATABASE_URL) {
      console.error("DATABASE_URL not configured");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
      const expiringSoonResult = await pool.query(
        `
        SELECT 
          id,
          amount,
          (metadata->>'expires_at')::timestamp as expiry_date,
          metadata->>'reason' as description,
          created_at,
          EXTRACT(DAY FROM ((metadata->>'expires_at')::timestamp - NOW())) as days_until_expiry
        FROM wallet_ledger
        WHERE customer_id = $1
          AND type = 'EARN'
          AND (metadata->>'expires_at')::timestamp IS NOT NULL
          AND (metadata->>'expires_at')::timestamp BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        ORDER BY (metadata->>'expires_at')::timestamp ASC
      `,
        [customerId]
      );

      const expiringCoins = expiringSoonResult.rows;
      const totalExpiringSoon = expiringCoins.reduce(
        (sum, c) => sum + (parseFloat(c.amount) || 0),
        0
      );

      const earliestExpiry = expiringCoins.length > 0 ? expiringCoins[0].expiry_date : null;

      const in7Days = expiringCoins
        .filter((c) => parseInt(c.days_until_expiry, 10) <= 7)
        .reduce((sum, c) => sum + parseFloat(c.amount), 0);

      const in15Days = expiringCoins
        .filter((c) => parseInt(c.days_until_expiry, 10) <= 15)
        .reduce((sum, c) => sum + parseFloat(c.amount), 0);

      await pool.end();

      return NextResponse.json({
        expiring_soon: totalExpiringSoon / 100,
        earliest_expiry: earliestExpiry,
        breakdown: {
          expiring_in_7_days: in7Days / 100,
          expiring_in_15_days: in15Days / 100,
          expiring_in_30_days: totalExpiringSoon / 100,
        },
        coins_expiring: expiringCoins.map((c) => ({
          id: c.id,
          amount: (parseFloat(c.amount) || 0) / 100,
          expiry_date: c.expiry_date,
          days_until_expiry: parseInt(c.days_until_expiry, 10),
          description: c.description,
        })),
      });
    } catch (dbErr) {
      console.error("Database error fetching expiring coins:", dbErr);
      await pool.end().catch(() => {});
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  } catch (error) {
    console.error("Expiring coins API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
