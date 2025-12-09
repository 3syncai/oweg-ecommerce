import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function inspectRawAmount() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT raw_amount FROM price 
      WHERE raw_amount IS NOT NULL 
      LIMIT 1;
    `);
    
    if (res.rows.length > 0) {
        console.log("Raw Amount Structure:");
        console.log(JSON.stringify(res.rows[0].raw_amount, null, 2));
    } else {
        console.log("No prices found.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

inspectRawAmount();
