import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const OPENCART_CONFIG = {
  host: process.env.OPENCART_DB_HOST || "147.93.31.253",
  port: parseInt(process.env.OPENCART_DB_PORT || "3306"),
  user: process.env.OPENCART_DB_USER || "oweg_user2",
  password: process.env.OPENCART_DB_PASSWORD || "Oweg#@123",
  database: process.env.OPENCART_DB_NAME || "oweg_db",
};

async function checkStatus() {
  let conn;
  try {
    conn = await mysql.createConnection(OPENCART_CONFIG);
    const [rows] = await conn.execute(`
      SELECT product_id, status FROM oc_product LIMIT 10;
    `);
    console.log("OpenCart Product Status Samples:", rows);
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) await conn.end();
  }
}

checkStatus();
