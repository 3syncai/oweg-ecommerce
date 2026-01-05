require('dotenv').config();
const axios = require('axios');

const BASE = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_KEY = process.env.MEDUSA_ADMIN_BASIC;

const client = axios.create({
  baseURL: BASE,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${ADMIN_KEY}`,
  },
});

async function checkProducts() {
  try {
    // Get all products
    const { data } = await client.get('/admin/products', {
      params: { limit: 10, offset: 0 }
    });
    
    const products = data?.products || [];
    console.log(`\n📦 Found ${products.length} products:\n`);
    
    for (const product of products) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Product: ${product.title}`);
      console.log(`ID: ${product.id}`);
      console.log(`Status: ${product.status}`);
      console.log(`Handle: ${product.handle}`);
      
      // Get variants with inventory
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          console.log(`\n  Variant: ${variant.title}`);
          console.log(`  SKU: ${variant.sku || 'N/A'}`);
          
          // Get inventory item
          try {
            const invResp = await client.get(`/admin/inventory-items`, {
              params: { sku: variant.sku }
            });
            
            const invItems = invResp.data?.inventory_items || [];
            if (invItems.length > 0) {
              const invItem = invItems[0];
              console.log(`  Inventory Item ID: ${invItem.id}`);
              
              // Get inventory levels
              const levelsResp = await client.get(`/admin/inventory-items/${invItem.id}/location-levels`);
              const levels = levelsResp.data?.inventory_levels || [];
              
              if (levels.length > 0) {
                console.log(`  📊 Stock Levels:`);
                for (const level of levels) {
                  console.log(`    Location: ${level.location_id}`);
                  console.log(`    Stocked Quantity: ${level.stocked_quantity}`);
                  console.log(`    Available Quantity: ${level.available_quantity}`);
                }
              } else {
                console.log(`  ⚠️  No stock levels found`);
              }
            } else {
              console.log(`  ⚠️  No inventory item found`);
            }
          } catch (err) {
            console.log(`  ❌ Error fetching inventory: ${err.message}`);
          }
        }
      }
      
      console.log(`\n`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

checkProducts();

