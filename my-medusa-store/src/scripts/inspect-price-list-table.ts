import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function inspectPriceList() {
  await client.connect();
  try {
    const tables = ['price_list', 'price_list_rule', 'price_rule'];
    
    for (const tbl of tables) {
        console.log(`\n--- Columns in ${tbl} table: ---`);
        const res = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = '${tbl}';
        `);
        res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

inspectPriceList();
