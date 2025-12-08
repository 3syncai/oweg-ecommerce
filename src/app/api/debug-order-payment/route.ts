import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Check for order_payment_collection link table
        const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%order%payment%' OR table_name LIKE '%payment%order%')
    `);

        // Check payment_collection columns
        const pcCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'payment_collection'
    `);

        // Check if there's a link in order table
        const orderCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'order' AND column_name LIKE '%payment%'
    `);

        // Get latest payment_collection with captured_amount
        const latestPc = await pool.query(`
      SELECT id, amount, captured_amount, status FROM payment_collection 
      ORDER BY created_at DESC LIMIT 5
    `);

        await pool.end();

        return NextResponse.json({
            link_tables: tables.rows.map(r => r.table_name),
            payment_collection_columns: pcCols.rows.map(r => r.column_name),
            order_payment_columns: orderCols.rows.map(r => r.column_name),
            latest_payment_collections: latestPc.rows
        });
    } catch (err) {
        await pool.end();
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
