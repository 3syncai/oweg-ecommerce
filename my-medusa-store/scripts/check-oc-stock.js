require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkOCStock() {
  const connection = await mysql.createConnection({
    host: process.env.OC_HOST,
    port: process.env.OC_PORT || 3306,
    user: process.env.OC_USER,
    password: process.env.OC_PASSWORD,
    database: process.env.OC_DATABASE,
  });

  try {
    const [rows] = await connection.execute(`
      SELECT 
        p.product_id,
        p.model,
        p.sku,
        p.quantity,
        p.status,
        pd.name
      FROM oc_product p
      LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = 1
      WHERE p.product_id IN (51, 52)
      ORDER BY p.product_id
    `);

    console.log('\n📦 OpenCart Product Stock:\n');
    for (const row of rows) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Product ID: ${row.product_id}`);
      console.log(`Name: ${row.name}`);
      console.log(`SKU: ${row.sku}`);
      console.log(`Model: ${row.model}`);
      console.log(`Quantity: ${row.quantity}`);
      console.log(`Status: ${row.status === 1 ? 'Enabled' : 'Disabled'}`);
      console.log(``);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await connection.end();
  }
}

checkOCStock();

