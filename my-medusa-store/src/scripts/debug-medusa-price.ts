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

        // Check RJD210 (Jeans) and SF-400 (Weight Scale)
        const skus = ['OC-1644', 'SF-400', 'RJD210', 'RJD210-44', 'RJD225'];

        const query = `
      SELECT
        p.id                  AS product_id,
        p.title               AS product_title,
        p.metadata->>'opencart_id' as opencart_id,
        pv.sku                AS variant_sku,
        price.amount          AS price_amount,
        price.currency_code,
        pl.title              AS price_list
      FROM product p
      JOIN product_variant pv ON pv.product_id = p.id
      JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
      JOIN price_set ps ON ps.id = pvps.price_set_id
      JOIN price ON price.price_set_id = ps.id
      LEFT JOIN price_list pl ON pl.id = price.price_list_id
      WHERE pv.sku = ANY($1)
      ORDER BY pv.sku, price.amount;
    `;

        const res = await client.query(query, [skus]);

        console.table(res.rows);

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await client.end();
    }
}

verifyPrices();
