import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Check columns of order table
        const orderColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'order'
    `);

        // Check columns of payment_collection table
        const pcColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payment_collection'
    `);

        // Check links?
        // Maybe checking a recent order and its relations
        const recentOrder = await pool.query(`
      SELECT * FROM "order" ORDER BY created_at DESC LIMIT 1
    `);

        await pool.end();

        return NextResponse.json({
            success: true,
            order_columns: orderColumns.rows.map(r => r.column_name),
            payment_collection_columns: pcColumns.rows.map(r => r.column_name),
            recent_order: recentOrder.rows[0]
        });
    } catch (err) {
        await pool.end();
        return NextResponse.json({
            success: false,
            error: String(err),
        }, { status: 500 });
    }
}
