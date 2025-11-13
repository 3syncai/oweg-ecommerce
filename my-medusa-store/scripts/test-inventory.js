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

async function testInventory() {
  try {
    // Get first product
    const { data } = await client.get('/admin/products', {
      params: { limit: 1 }
    });
    
    const product = data?.products?.[0];
    if (!product) {
      console.log('No products found');
      return;
    }
    
    console.log(`\n📦 Product: ${product.title}`);
    console.log(`Status: ${product.status}`);
    
    const variant = product.variants?.[0];
    if (!variant) {
      console.log('No variants found');
      return;
    }
    
    console.log(`\n🔧 Variant: ${variant.title}`);
    console.log(`SKU: ${variant.sku}`);
    console.log(`Variant ID: ${variant.id}`);
    
    // Get inventory items for this variant
    const invResp = await client.get(`/admin/inventory-items`, {
      params: { sku: variant.sku }
    });
    
    const invItems = invResp.data?.inventory_items || [];
    console.log(`\n📊 Found ${invItems.length} inventory items`);
    
    if (invItems.length === 0) {
      console.log('\n⚠️  No inventory items found. Creating one...');
      
      // Create inventory item
      const createResp = await client.post('/admin/inventory-items', {
        sku: variant.sku,
        metadata: { test: true }
      });
      
      const newInvItem = createResp.data?.inventory_item;
      console.log(`✅ Created inventory item: ${newInvItem.id}`);
      
      // Link to variant
      console.log(`\n🔗 Linking to variant...`);
      await client.post(`/admin/variants/${variant.id}/inventory-items`, {
        inventory_item_id: newInvItem.id,
        required: true
      });
      console.log(`✅ Linked to variant`);
      
      // Get default location
      const locResp = await client.get('/admin/stock-locations', {
        params: { limit: 1 }
      });
      const location = locResp.data?.stock_locations?.[0];
      
      if (!location) {
        console.log('❌ No stock location found');
        return;
      }
      
      console.log(`\n📍 Default location: ${location.name} (${location.id})`);
      
      // Set stock level
      console.log(`\n📦 Setting stock level to 10...`);
      try {
        const levelResp = await client.post(
          `/admin/inventory-items/${newInvItem.id}/location-levels`,
          {
            location_id: location.id,
            stocked_quantity: 10
          }
        );
        console.log(`✅ Stock level set!`);
        console.log(JSON.stringify(levelResp.data, null, 2));
      } catch (err) {
        console.log(`❌ Failed to set stock level:`);
        console.log(`Status: ${err.response?.status}`);
        console.log(`Error: ${JSON.stringify(err.response?.data, null, 2)}`);
      }
      
    } else {
      const invItem = invItems[0];
      console.log(`Inventory Item ID: ${invItem.id}`);
      
      // Get stock levels
      const levelsResp = await client.get(`/admin/inventory-items/${invItem.id}/location-levels`);
      const levels = levelsResp.data?.inventory_levels || [];
      
      console.log(`\n📊 Stock Levels: ${levels.length}`);
      for (const level of levels) {
        console.log(`  Location: ${level.location_id}`);
        console.log(`  Stocked: ${level.stocked_quantity}`);
        console.log(`  Available: ${level.available_quantity}`);
      }
    }
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testInventory();

