import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const OPENCART_DB = {
    host: process.env.OPENCART_DB_HOST || '147.93.31.253',
    port: parseInt(process.env.OPENCART_DB_PORT || '3306', 10),
    user: process.env.OPENCART_DB_USER || 'oweg_user2',
    password: process.env.OPENCART_DB_PASSWORD || 'Oweg#@123',
    database: process.env.OPENCART_DB_NAME || 'oweg_db',
};

async function debugOC() {
    const connection = await mysql.createConnection(OPENCART_DB);

    // Models to check
    // Jeans: RJD210 (or RJD210-44)
    // Tawa: SF-400 (Weight machine seen in verification)
    const models = ['RJD210', 'RJD210-44', 'SF-400', 'OC-1644', 'RJD225', 'RJD225-30'];

    console.log('Fetching raw prices from OpenCart...');

    for (const model of models) {
        const [rows] = await connection.execute(
            `SELECT product_id, model, price FROM oc_product WHERE model = ?`,
            [model]
        ) as any[];

        if (rows.length > 0) {
            console.log(`\nModel: ${model}`);
            rows.forEach((r: any) => {
                console.log(`  PID: ${r.product_id} | Price: ${r.price}`);
                // Check specials
                connection.execute(
                    `SELECT price FROM oc_product_special WHERE product_id = ?`,
                    [r.product_id]
                ).then(([specials]: any) => {
                    if (specials.length > 0) {
                        console.log(`   Specials:`, specials.map((s: any) => s.price));
                    } else {
                        console.log(`  Specials: None`);
                    }
                });
            });
        } else {
            console.log(`\nModel: ${model} - Not Found`);
        }
    }

    // Allow async queries to finish printing
    setTimeout(() => {
        connection.end();
    }, 2000);
}

debugOC();
