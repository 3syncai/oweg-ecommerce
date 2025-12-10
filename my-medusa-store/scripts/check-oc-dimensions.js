const mysql = require('mysql2/promise');

async function checkDimensions() {
  const connection = await mysql.createConnection({
    host: process.env.OPENCART_DB_HOST,
    port: 3306,
    user: process.env.OPENCART_DB_USER,
    password: process.env.OPENCART_DB_PASSWORD,
    database: process.env.OPENCART_DB_NAME
  });

  try {
    console.log('Connected to OpenCart database\n');

    // Check first 5 products
    const [products] = await connection.execute(`
      SELECT 
        p.product_id,
        pd.name,
        p.model,
        p.sku,
        p.length,
        p.width,
        p.height,
        p.weight,
        p.length_class_id,
        p.weight_class_id,
        lcd.title AS length_unit,
        wcd.title AS weight_unit
      FROM oc_product p
      INNER JOIN oc_product_description pd ON pd.product_id = p.product_id AND pd.language_id = 1
      LEFT JOIN oc_length_class_description lcd ON lcd.length_class_id = p.length_class_id AND lcd.language_id = 1
      LEFT JOIN oc_weight_class_description wcd ON wcd.weight_class_id = p.weight_class_id AND wcd.language_id = 1
      ORDER BY p.product_id
      LIMIT 10
    `);

    console.log('First 10 products from OpenCart:\n');
    console.table(products);

    // Check if any products have dimensions
    const [withDims] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM oc_product
      WHERE (length IS NOT NULL AND length > 0)
         OR (width IS NOT NULL AND width > 0)
         OR (height IS NOT NULL AND height > 0)
         OR (weight IS NOT NULL AND weight > 0)
    `);

    console.log(`\nProducts with dimensions: ${withDims[0].count}`);

    // Check total products
    const [total] = await connection.execute(`SELECT COUNT(*) as count FROM oc_product`);
    console.log(`Total products: ${total[0].count}`);

  } finally {
    await connection.end();
  }
}

checkDimensions().catch(console.error);

