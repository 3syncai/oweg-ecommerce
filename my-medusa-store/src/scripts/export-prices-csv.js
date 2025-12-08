const mysql = require('mysql2/promise');
const fs = require('fs');

/**
 * CSV PRICE EXPORT - OpenCart prices for review/import
 * 
 * Exports all product prices to CSV for manual import or review
 * Run: node src/scripts/export-prices-csv.js
 */

const OPENCART = {
  host: process.env.OPENCART_DB_HOST,
  port: 3306,
  user: process.env.OPENCART_DB_USER,
  password: process.env.OPENCART_DB_PASSWORD,
  database: process.env.OPENCART_DB_NAME,
};

async function main() {
  console.log('\n📊 Exporting OpenCart prices to CSV...\n');

  let conn = null;
  
  try {
    // Connect
    console.log('📡 Connecting to OpenCart...');
    conn = await mysql.createConnection(OPENCART);
    console.log('✅ Connected\n');

    // Fetch prices
    console.log('📥 Fetching product prices...');
    const [rows] = await conn.execute(`
      SELECT 
        p.product_id as opencart_id,
        pd.name as product_name,
        p.price as base_price,
        (
          SELECT ps.price FROM oc_product_special ps
          WHERE ps.product_id = p.product_id
            AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
            AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
          ORDER BY ps.priority ASC, ps.price ASC
          LIMIT 1
        ) AS special_price
      FROM oc_product p
      INNER JOIN oc_product_description pd ON p.product_id = pd.product_id
      WHERE pd.language_id = 1 AND p.price > 0
      ORDER BY p.product_id
    `);
    
    console.log(`✅ Found ${rows.length} products\n`);

    // Create CSV
    console.log('💾 Writing CSV file...');
    let csv = 'OpenCart ID,Product Name,Base Price (INR),Special Price (INR),Discount %,Price in Paise\n';
    
    for (const row of rows) {
      const basePrice = parseFloat(row.base_price || 0);
      const specialPrice = row.special_price ? parseFloat(row.special_price) : null;
      const discount = specialPrice ? Math.round(((basePrice - specialPrice) / basePrice) * 100) : 0;
      const priceInPaise = Math.round(basePrice * 100);
      
      // Escape product name for CSV
      const name = String(row.product_name || '').replace(/"/g, '""');
      
      csv += `${row.opencart_id},"${name}",${basePrice},${specialPrice || ''},${discount},${priceInPaise}\n`;
    }

    // Write file
    const filename = `opencart-prices-${Date.now()}.csv`;
    fs.writeFileSync(filename, csv, 'utf8');
    
    console.log(`✅ Exported to: ${filename}`);
    console.log(`\nℹ️  You can now:`);
    console.log(`   1. Open in Excel/Google Sheets`);
    console.log(`   2. Review prices`);
    console.log(`   3. Import or manually update in Medusa Admin\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
