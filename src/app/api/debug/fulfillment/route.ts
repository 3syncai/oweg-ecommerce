import { NextResponse } from "next/server";
import { Pool } from 'pg';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const fsId = searchParams.get("fs_id");
    const locId = searchParams.get("loc_id");

    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: "No DB URL" }, { status: 400 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const results: any = {};

        // 1. Check all links in location_fulfillment_set
        const linksRes = await pool.query(`SELECT * FROM location_fulfillment_set`);
        results.all_links = linksRes.rows;

        // 2. Specific Check if params provided
        if (fsId && locId) {
            const specificRes = await pool.query(`
                SELECT * FROM location_fulfillment_set 
                WHERE stock_location_id = $1 AND fulfillment_set_id = $2
            `, [locId, fsId]);
            results.specific_link = specificRes.rows;
            results.is_linked = (specificRes.rowCount || 0) > 0;
        }

        await pool.end();
        return NextResponse.json(results);
    } catch (e) {
        await pool.end();
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
