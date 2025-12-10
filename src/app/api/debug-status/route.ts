import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Check the status values from existing payment_collections
        const existing = await pool.query(`
      SELECT DISTINCT status FROM payment_collection LIMIT 20
    `);

        // Check constraint definition
        const constraint = await pool.query(`
      SELECT pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conname = 'payment_collection_status_check'
    `);

        await pool.end();

        return NextResponse.json({
            existing_statuses: existing.rows.map(r => r.status),
            constraint_definition: constraint.rows[0]?.def
        });
    } catch (err) {
        await pool.end();
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
