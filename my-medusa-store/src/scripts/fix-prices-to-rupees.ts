import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function fixPrices() {
  await client.connect();
  try {
    console.log("🔧 Converting ALL prices from Paise to Rupees (÷100)...");

    // 1. Check current state (sample)
    const before = await client.query(`
      SELECT amount FROM price WHERE currency_code = 'inr' LIMIT 3
    `);
    console.log("Sample BEFORE:", before.rows.map(r => r.amount));

    // 2. Update all INR prices: divide by 100
    const result = await client.query(`
      UPDATE price 
      SET amount = amount / 100,
          raw_amount = jsonb_build_object('value', (amount / 100)::text, 'precision', 20),
          updated_at = NOW()
      WHERE currency_code = 'inr'
      RETURNING id
    `);
    console.log(`✅ Updated ${result.rowCount} prices.`);

    // 3. Verify
    const after = await client.query(`
      SELECT amount FROM price WHERE currency_code = 'inr' LIMIT 3
    `);
    console.log("Sample AFTER:", after.rows.map(r => r.amount));

    console.log("\n🎉 SUCCESS: All prices now in Rupees (major units).");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.end();
  }
}

fixPrices();
