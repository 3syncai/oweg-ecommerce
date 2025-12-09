import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function standardizeToPaise() {
  await client.connect();
  console.log('🔌 Connected to DB');

  try {
    console.log('🚀 Starting standardization to Minor Units (Paise)...');
    
    // Perform a bulk update directly in SQL for maximum efficiency and safety.
    // We update 'amount' by multiplying by 100.
    // We also assume we are ONLY updating 'INR' prices or ALL prices if the store is INR-only.
    // Based on previous context, this store seems INR focused.
    // To be safe, let's target prices that are "suspiciously low" (Rupees) if needed, 
    // BUT since we just converted EVERYTHING to Rupees, we should convert EVERYTHING back.
    
    // We update 'amount' by multiplying by 100 in the 'price' table.
    const query = `
      UPDATE price 
      SET amount = amount * 100
      WHERE currency_code = 'inr' 
      RETURNING id, amount;
    `;
    
    const res = await client.query(query);
    
    console.log(`🎉 SUCCESS: Updated ${res.rowCount} prices.`);
    if (res.rows.length > 0) {
        console.log('Sample updated rows:', res.rows.slice(0, 5));
    }

  } catch (err) {
    console.error('❌ Error during standardization:', err instanceof Error ? err.message : err);
  } finally {
    await client.end();
  }
}

standardizeToPaise();
