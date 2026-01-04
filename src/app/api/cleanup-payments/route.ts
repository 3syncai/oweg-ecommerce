import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function POST() {
    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Delete all test payment data created today
        // This will clean up the mess from testing

        // 1. Delete payments
        const payments = await pool.query(`
      DELETE FROM payment 
      WHERE created_at > '2025-12-07' 
      RETURNING id
    `);

        // 2. Delete payment_sessions
        const sessions = await pool.query(`
      DELETE FROM payment_session 
      WHERE created_at > '2025-12-07' 
      RETURNING id
    `);

        // 3. Delete order_payment_collection links created today
        const links = await pool.query(`
      DELETE FROM order_payment_collection 
      WHERE created_at > '2025-12-07' 
      RETURNING id
    `);

        // 4. Delete payment_collections we created (with our metadata pattern)
        const collections = await pool.query(`
      DELETE FROM payment_collection 
      WHERE created_at > '2025-12-07' 
      AND metadata->>'cart_id' IS NOT NULL
      RETURNING id
    `);

        await pool.end();

        return NextResponse.json({
            success: true,
            deleted: {
                payments: payments.rowCount,
                sessions: sessions.rowCount,
                links: links.rowCount,
                collections: collections.rowCount
            },
            message: "Test payment data cleaned up. Place a new order to test fresh!"
        });
    } catch (err) {
        await pool.end();
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        instructions: "POST to this endpoint to delete test payment data from today"
    });
}
