require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

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

async function fixAllInventory() {
  try {
    console.log('\nFetching stock quantities from OpenCart...');
    
    // Get stock quantities from OpenCart
    const connection = await mysql.createConnection({
      host: process.env.OC_HOST,
      port: process.env.OC_PORT || 3306,
      user: process.env.OC_USER,
      password: process.env.OC_PASSWORD,
      database: process.env.OC_DATABASE,
    });

    const [ocProducts] = await connection.execute(`
      SELECT sku, model, quantity 
      FROM oc_product 
      WHERE status = 1
    `);
    
    await connection.end();

    // Create SKU to quantity map (with multiple variations for matching)
    const skuQuantityMap = {};
    let negativeQtyCount = 0;
    
    for (const product of ocProducts) {
      const sku = (product.sku || product.model || '').trim();
      if (sku) {
        // Parse quantity and sanitize negative values
        let qty = parseInt(product.quantity);
        
        // Handle invalid/negative quantities
        if (isNaN(qty) || qty < 0) {
          if (qty < 0) {
            console.log(`⚠️  SKU "${sku}" has negative quantity (${qty}), setting to 0`);
            negativeQtyCount++;
          }
          qty = 0;
        }
        
        skuQuantityMap[sku] = qty;
        // Also store variations with spaces replaced
        skuQuantityMap[sku.replace(/\s+/g, '_')] = qty;
        skuQuantityMap[sku.replace(/\s+/g, '-')] = qty;
        skuQuantityMap[sku.replace(/\s+/g, '')] = qty;
      }
    }

    console.log(`Found ${Object.keys(skuQuantityMap).length} SKU variations from OpenCart`);
    if (negativeQtyCount > 0) {
      console.log(`⚠️  Converted ${negativeQtyCount} negative quantities to 0\n`);
    } else {
      console.log('');
    }

    // Get all inventory items from Medusa
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let totalFixed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const failedSKUs = [];

    // Get default location
    console.log('Fetching stock locations from Medusa...');
    let locResp;
    try {
      locResp = await client.get('/admin/stock-locations', { params: { limit: 1 } });
    } catch (err) {
      console.error('Failed to fetch stock locations:', err.message);
      if (err.code) console.error('Error code:', err.code);
      if (err.cause) console.error('Cause:', err.cause);
      throw err;
    }
    
    const location = locResp.data?.stock_locations?.[0];
    
    if (!location) {
      console.log('ERROR: No stock location found');
      return;
    }
    
    console.log(`Using location: ${location.name} (${location.id})\n`);

    while (hasMore) {
      const invResp = await client.get('/admin/inventory-items', {
        params: { limit, offset }
      });
      
      const items = invResp.data?.inventory_items || [];
      
      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const sku = (item.sku || '').trim();
        
        // Try to find quantity with various SKU formats
        let expectedQty = skuQuantityMap[sku];
        if (expectedQty === undefined) {
          expectedQty = skuQuantityMap[sku.replace(/\s+/g, '_')] 
                    || skuQuantityMap[sku.replace(/\s+/g, '-')] 
                    || skuQuantityMap[sku.replace(/\s+/g, '')];
        }

        if (expectedQty === undefined) {
          totalSkipped++;
          continue;
        }

        try {
          // Check if location level exists
          const levelsResp = await client.get(`/admin/inventory-items/${item.id}/location-levels`);
          const levels = levelsResp.data?.inventory_levels || [];
          const existingLevel = levels.find(l => l.location_id === location.id);

          if (!existingLevel) {
            // Create new location level
            await client.post(
              `/admin/inventory-items/${item.id}/location-levels`,
              {
                location_id: location.id,
                stocked_quantity: expectedQty
              }
            );
            console.log(`✅ Set stock for SKU "${sku}": ${expectedQty}`);
          } else if (existingLevel.stocked_quantity !== expectedQty) {
            // Update existing location level
            await client.post(
              `/admin/inventory-items/${item.id}/location-levels/${location.id}`,
              {
                stocked_quantity: expectedQty
              }
            );
            console.log(`✅ Updated stock for SKU "${sku}": ${existingLevel.stocked_quantity} -> ${expectedQty}`);
          }
          
          totalFixed++;
        } catch (err) {
          totalErrors++;
          
          // Enhanced error logging
          const errorDetails = {
            sku: sku,
            inventoryItemId: item.id,
            expectedQty: expectedQty,
            statusCode: err.response?.status,
            errorMessage: err.response?.data?.message || err.message,
            errorType: err.response?.data?.type,
            errorDetails: err.response?.data
          };
          
          failedSKUs.push(errorDetails);
          
          console.log(`❌ Failed to set stock for SKU "${sku}"`);
          console.log(`   Status: ${errorDetails.statusCode}`);
          console.log(`   Message: ${errorDetails.errorMessage}`);
          
          if (err.response?.data?.errors) {
            console.log(`   Details:`, JSON.stringify(err.response.data.errors, null, 2));
          }
        }
      }

      offset += limit;
    }

    console.log(`\n============================================`);
    console.log(`Inventory fix completed!`);
    console.log(`  ✅ Fixed: ${totalFixed}`);
    console.log(`  ⏭️  Skipped: ${totalSkipped}`);
    console.log(`  ❌ Errors: ${totalErrors}`);
    console.log(`============================================\n`);
    
    if (failedSKUs.length > 0) {
      console.log(`\n📋 Failed SKUs Summary:\n`);
      for (const fail of failedSKUs) {
        console.log(`SKU: "${fail.sku}"`);
        console.log(`  Inventory ID: ${fail.inventoryItemId}`);
        console.log(`  Expected Qty: ${fail.expectedQty}`);
        console.log(`  Error: ${fail.errorMessage}`);
        if (fail.errorDetails) {
          console.log(`  Details:`, JSON.stringify(fail.errorDetails, null, 2));
        }
        console.log('');
      }
    }
    
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error('Stack:', err.stack);
    if (err.response?.data) {
      console.error('Response:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

fixAllInventory();

