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

async function fixInventory() {
  try {
    // Get all inventory items
    const invResp = await client.get('/admin/inventory-items', {
      params: { limit: 10 }
    });
    
    const items = invResp.data?.inventory_items || [];
    console.log(`\n📦 Found ${items.length} inventory items\n`);
    
    // Get default stock location
    const locResp = await client.get('/admin/stock-locations', {
      params: { limit: 1 }
    });
    const location = locResp.data?.stock_locations?.[0];
    
    if (!location) {
      console.log('❌ No stock location found');
      return;
    }
    
    console.log(`📍 Default Location: ${location.name} (${location.id})\n`);
    
    // Map SKU to expected quantity from OpenCart
    const expectedQuantities = {
      '102': 2,    // Product 51
      '14046': 9   // Product 52
    };
    
    for (const item of items) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Inventory Item: ${item.id}`);
      console.log(`SKU: ${item.sku}`);
      
      const expectedQty = expectedQuantities[item.sku] || 0;
      console.log(`Expected Quantity: ${expectedQty}`);
      
      // Check current levels
      try {
        const levelsResp = await client.get(`/admin/inventory-items/${item.id}/location-levels`);
        const levels = levelsResp.data?.inventory_levels || [];
        
        console.log(`Current Levels: ${levels.length}`);
        
        if (levels.length === 0) {
          console.log(`\n🔧 Creating location level...`);
          
          // Try to create
          try {
            const createResp = await client.post(
              `/admin/inventory-items/${item.id}/location-levels`,
              {
                location_id: location.id,
                stocked_quantity: expectedQty
              }
            );
            console.log(`✅ Created! Stocked: ${expectedQty}`);
          } catch (createErr) {
            console.log(`❌ Create failed:`);
            console.log(`   Status: ${createErr.response?.status}`);
            console.log(`   Error: ${JSON.stringify(createErr.response?.data, null, 2)}`);
            
            // Try update instead
            console.log(`\n🔧 Trying update instead...`);
            try {
              const updateResp = await client.post(
                `/admin/inventory-items/${item.id}/location-levels/${location.id}`,
                {
                  stocked_quantity: expectedQty
                }
              );
              console.log(`✅ Updated! Stocked: ${expectedQty}`);
            } catch (updateErr) {
              console.log(`❌ Update also failed:`);
              console.log(`   Status: ${updateErr.response?.status}`);
              console.log(`   Error: ${JSON.stringify(updateErr.response?.data, null, 2)}`);
            }
          }
        } else {
          console.log(`\n📊 Existing levels:`);
          for (const level of levels) {
            console.log(`   Location: ${level.location_id}`);
            console.log(`   Stocked: ${level.stocked_quantity}`);
            console.log(`   Available: ${level.available_quantity}`);
          }
          
          // Update if different
          const existingLevel = levels.find(l => l.location_id === location.id);
          if (existingLevel && existingLevel.stocked_quantity !== expectedQty) {
            console.log(`\n🔧 Updating to ${expectedQty}...`);
            try {
              await client.post(
                `/admin/inventory-items/${item.id}/location-levels/${location.id}`,
                {
                  stocked_quantity: expectedQty
                }
              );
              console.log(`✅ Updated!`);
            } catch (err) {
              console.log(`❌ Update failed: ${err.message}`);
            }
          }
        }
      } catch (err) {
        console.log(`❌ Error checking levels: ${err.message}`);
      }
      
      console.log(``);
    }
    
    console.log(`\n✅ Done! Check inventory in Medusa Admin.`);
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

fixInventory();

