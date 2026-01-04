require('dotenv').config();
const { Client } = require('pg');

async function fixINRCurrency() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const result = await client.query(
      "UPDATE currency SET decimal_digits=0 WHERE code='inr' RETURNING *;"
    );
    
    if (result.rowCount > 0) {
      console.log('✅ INR currency updated to 0 decimals');
      console.log('   Updated:', result.rows[0]);
    } else {
      console.log('⚠️  No INR currency found to update');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixINRCurrency();

