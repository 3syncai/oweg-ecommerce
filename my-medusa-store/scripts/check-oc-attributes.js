const mysql = require('mysql2/promise');

async function checkAttributes() {
  const connection = await mysql.createConnection({
    host: process.env.OPENCART_DB_HOST,
    port: 3306,
    user: process.env.OPENCART_DB_USER,
    password: process.env.OPENCART_DB_PASSWORD,
    database: process.env.OPENCART_DB_NAME
  });

  try {
    console.log('Connected to OpenCart database\n');

    // Check oc_product table structure
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM oc_product
    `);

    console.log('oc_product table columns:\n');
    console.table(columns.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Default: c.Default })));

    // Check for specific attribute fields
    console.log('\n\nLooking for attribute-related columns...\n');
    const attrColumns = columns.filter(c => 
      c.Field.includes('mid') || 
      c.Field.includes('hs') || 
      c.Field.includes('origin') ||
      c.Field.includes('country') ||
      c.Field.includes('code')
    );
    console.table(attrColumns.map(c => ({ Field: c.Field, Type: c.Type })));

    // Check first product with all potential attribute fields
    const [products] = await connection.execute(`
      SELECT 
        product_id,
        model,
        sku,
        upc,
        ean,
        jan,
        isbn,
        mpn,
        location,
        length,
        width,
        height,
        weight
      FROM oc_product
      WHERE product_id = 51
      LIMIT 1
    `);

    console.log('\n\nProduct 51 data:\n');
    console.table(products);

  } finally {
    await connection.end();
  }
}

checkAttributes().catch(console.error);

