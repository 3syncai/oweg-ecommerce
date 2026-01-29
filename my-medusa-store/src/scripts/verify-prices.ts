import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function verifyPrices() {
    try {
        await client.connect();

        console.log('Running verification query...');

        const query = `
      SELECT
        p.id                  AS product_id,
        p.title               AS product_title,
        pv.id                 AS variant_id,
        pv.title              AS variant_title,
        pv.sku                AS variant_sku,

        base_p.currency_code,
        base_p.amount         AS base_price,          -- normal price (no price_list)

        pl.id                 AS price_list_id,
        pl.title              AS price_list_title,    -- <-- title, not name
        pl.type               AS price_list_type,     -- 'sale' / 'override'
        disc_p.amount         AS discounted_price     -- price from price list
      FROM product p
      JOIN product_variant pv
        ON pv.product_id = p.id
      JOIN product_variant_price_set pvps
        ON pvps.variant_id = pv.id
      JOIN price_set ps
        ON ps.id = pvps.price_set_id

      -- Base price (no price_list_id)
      LEFT JOIN price base_p
        ON base_p.price_set_id = ps.id
       AND base_p.price_list_id IS NULL
       AND base_p.min_quantity IS NULL
       AND base_p.max_quantity IS NULL

      -- Discount / special price from price lists
      LEFT JOIN price disc_p
        ON disc_p.price_set_id = ps.id
       AND disc_p.price_list_id IS NOT NULL
       AND disc_p.min_quantity IS NULL
       AND disc_p.max_quantity IS NULL

      LEFT JOIN price_list pl
        ON pl.id = disc_p.price_list_id

      WHERE p.deleted_at IS NULL
        AND pv.deleted_at IS NULL
      ORDER BY p.title, pv.sku, pl.title
      LIMIT 20;
    `;

        const res = await client.query(query);

        console.table(res.rows);
        console.log(`\nVerified ${res.rows.length} rows.`);

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await client.end();
    }
}

verifyPrices();
