import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
    try {
        // Check if DATABASE_URL is set
        if (!process.env.DATABASE_URL) {
            return NextResponse.json({
                success: false,
                error: 'DATABASE_URL not set in environment variables',
                env_check: {
                    DATABASE_URL: 'NOT SET',
                    MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'NOT SET',
                }
            }, { status: 500 });
        }

        // Try to connect to database
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });

        const result = await pool.query('SELECT NOW()');
        await pool.end();

        return NextResponse.json({
            success: true,
            message: 'Database connection successful',
            database_time: result.rows[0].now,
            env_check: {
                DATABASE_URL: 'SET ✓',
                MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'NOT SET',
            }
        });
    } catch (err) {
        return NextResponse.json({
            success: false,
            error: String(err),
            message: 'Database connection failed',
        }, { status: 500 });
    }
}
