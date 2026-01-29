import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const OLD_URL_PREFIX = 'https://oweg-product-images.s3.ap-south-1.amazonaws.com';
const NEW_URL_PREFIX = 'https://oweg-product-images-new.s3.ap-south-1.amazonaws.com';

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not found in .env');
    process.exit(1);
}

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log('Connecting to database...');
        await client.connect();

        console.log(`Migrating URLs from: ${OLD_URL_PREFIX}`);
        console.log(`To: ${NEW_URL_PREFIX}`);

        // Update 'image' table
        console.log('Updating "image" table...');
        const imageResult = await client.query(
            `UPDATE image 
       SET url = REPLACE(url, $1, $2) 
       WHERE url LIKE $3`,
            [OLD_URL_PREFIX, NEW_URL_PREFIX, `${OLD_URL_PREFIX}%`]
        );
        console.log(`Updated ${imageResult.rowCount} rows in "image" table.`);

        // Update 'product' table (thumbnail)
        console.log('Updating "product" table (thumbnails)...');
        const productResult = await client.query(
            `UPDATE product 
       SET thumbnail = REPLACE(thumbnail, $1, $2) 
       WHERE thumbnail LIKE $3`,
            [OLD_URL_PREFIX, NEW_URL_PREFIX, `${OLD_URL_PREFIX}%`]
        );
        console.log(`Updated ${productResult.rowCount} rows in "product" table.`);

        console.log('Migration complete.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await client.end();
    }
}

migrate();
