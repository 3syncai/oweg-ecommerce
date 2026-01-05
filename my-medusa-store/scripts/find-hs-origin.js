const mysql = require('mysql2/promise');

async function findHsAndOrigin() {
  const connection = await mysql.createConnection({
    host: process.env.OPENCART_DB_HOST,
    port: 3306,
    user: process.env.OPENCART_DB_USER,
    password: process.env.OPENCART_DB_PASSWORD,
    database: process.env.OPENCART_DB_NAME
  });

  try {
    console.log('Connected to OpenCart database\n');

    // Show all tables
    const [tables] = await connection.execute(`SHOW TABLES LIKE 'oc_%'`);
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    // Look for tables that might contain custom fields
    const relevantTables = tableNames.filter(t => 
      t.includes('attribute') || 
      t.includes('custom') || 
      t.includes('field') ||
      t.includes('option')
    );
    
    console.log('Tables that might contain custom attributes:\n');
    console.log(relevantTables.join('\n'));

    // Check oc_product_attribute table
    if (tableNames.includes('oc_product_attribute')) {
      console.log('\n\nChecking oc_product_attribute table...\n');
      const [attrs] = await connection.execute(`
        SELECT 
          pa.product_id,
          pa.attribute_id,
          ad.name as attribute_name,
          pa.text as attribute_value
        FROM oc_product_attribute pa
        LEFT JOIN oc_attribute_description ad ON ad.attribute_id = pa.attribute_id AND ad.language_id = 1
        WHERE pa.product_id IN (51, 52, 53)
        ORDER BY pa.product_id, pa.attribute_id
      `);
      console.table(attrs);
    }

    // Check if there's a custom table for HS code or origin
    for (const table of ['oc_product_description', 'oc_product_to_store']) {
      if (tableNames.includes(table)) {
        console.log(`\n\nChecking ${table} structure...\n`);
        const [cols] = await connection.execute(`SHOW COLUMNS FROM ${table}`);
        console.table(cols.map(c => ({ Field: c.Field, Type: c.Type })));
      }
    }

  } finally {
    await connection.end();
  }
}

findHsAndOrigin().catch(console.error);

