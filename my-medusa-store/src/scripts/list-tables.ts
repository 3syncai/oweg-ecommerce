import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function listTables() {
    try {
        await client.connect();

        const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND (table_name LIKE '%price%' OR table_name LIKE '%link%')
      ORDER BY table_name;
    `);

        console.log('Found tables:', res.rows.map(r => r.table_name));

    } catch (error) {
        console.error('List tables failed:', error);
    } finally {
        await client.end();
    }
}

listTables();
