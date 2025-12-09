// src/scripts/list-shipping-options.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    console.log('=== Listing Shipping Options ===');

    const res = await pool.query(`
        SELECT id, name, price_type, service_zone_id, shipping_profile_id
        FROM shipping_option
    `);

    console.table(res.rows);
    await pool.end();
}

main().catch(console.error);
