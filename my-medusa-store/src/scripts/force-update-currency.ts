import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function forceUpdate() {
  await client.connect();
  try {
    console.log("--- Forcing Update on INR Currency ---");
    // Explicitly set to 2
    const res = await client.query(`
      UPDATE currency 
      SET decimal_digits = 2, updated_at = NOW() 
      WHERE code = 'inr'
      RETURNING *;
    `);
    console.log("Updated:", res.rows[0]);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

forceUpdate();
