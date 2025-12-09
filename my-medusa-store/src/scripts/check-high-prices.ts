import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkHighPrices() {
  await client.connect();
  try {
    // Check for extremely high prices (e.g. > 10,00,000 paise = 10k rupees? No wait. 10L paise = 10,000 rupees. 
    // Normal high price: 20000 rupees = 20,00,000 paise.
    // If double converted: 20000 * 100 * 100 = 20,00,00,000 (20 Crore paise).
    // Let's look at the top prices.
    const res = await client.query(`
      SELECT id, amount, currency_code 
      FROM price 
      WHERE currency_code = 'inr' 
      ORDER BY amount DESC 
      LIMIT 20;
    `);
    console.log('Top 20 Highest Prices (Paise):', res.rows);
    
    // Also check small prices to compare
    const resLow = await client.query(`
      SELECT id, amount, currency_code 
      FROM price 
      WHERE currency_code = 'inr' 
      ORDER BY amount ASC 
      LIMIT 5;
    `);
    console.log('Top 5 Lowest Prices (Paise):', resLow.rows);
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkHighPrices();
