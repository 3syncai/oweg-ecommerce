#!/usr/bin/env node
/**
 * Fix inventory location and dimensions for existing products
 */

const axios = require('axios');

const MEDUSA_URL = process.env.MEDUSA_URL || 'http://localhost:9000';
const ADMIN_KEY = process.env.MEDUSA_ADMIN_BASIC;

if (!ADMIN_KEY) {
  console.error('Error: MEDUSA_ADMIN_BASIC environment variable is required');
  process.exit(1);
}

const admin = axios.create({
  baseURL: `${MEDUSA_URL}/admin`,
  headers: {
    'Authorization': `Basic ${ADMIN_KEY}`,
    'Content-Type': 'application/json',
  },
});

async function main() {
  try {
    console.log('Connecting to Medusa...');
    console.log(`URL: ${MEDUSA_URL}/admin`);
    console.log(`Auth: Basic ${ADMIN_KEY.substring(0, 10)}...`);
    
    // Get default location
    console.log('\nFetching default location...');
    const { data: locData } = await admin.get('/stock-locations?name=Default');
    const defaultLocation = locData.stock_locations?.[0];
    if (!defaultLocation) {
      console.error('No Default location found');
      process.exit(1);
    }
    console.log(`Default location: ${defaultLocation.id}\n`);
    
    // Get all products
    const { data } = await admin.get('/products?limit=100');
    const products = data.products || [];
    
    console.log(`Found ${products.length} products\n`);
    
    for (const product of products) {
      console.log(`\nProduct: ${product.title}`);
      console.log(`  ID: ${product.id}`);
      
      const metadata = product.metadata || {};
      const ocQty = metadata.oc_qty || 0;
      
      // Get dimensions from metadata
      const length = metadata.length ? parseFloat(metadata.length) : null;
      const width = metadata.width ? parseFloat(metadata.width) : null;
      const height = metadata.height ? parseFloat(metadata.height) : null;
      const weight = metadata.weight ? parseFloat(metadata.weight) : null;
      const lengthUnit = metadata.length_unit || 'Centimeter';
      const weightUnit = metadata.weight_unit || 'Kilogram';
      
      console.log(`  OC Quantity: ${ocQty}`);
      console.log(`  Dimensions: ${length}x${width}x${height} ${lengthUnit}, ${weight} ${weightUnit}`);
      
      for (const variant of product.variants || []) {
        console.log(`\n  Variant: ${variant.sku}`);
        
        // Get inventory item
        const { data: invData } = await admin.get(`/inventory-items?sku=${variant.sku}`);
        const inventoryItem = invData.inventory_items?.[0];
        
        if (!inventoryItem) {
          console.log(`    ⚠️  No inventory item found`);
          continue;
        }
        
        console.log(`    Inventory ID: ${inventoryItem.id}`);
        
        // Check current location levels
        const { data: levelData } = await admin.get(`/inventory-items/${inventoryItem.id}/location-levels`);
        const hasLocation = levelData.inventory_levels?.some(l => l.location_id === defaultLocation.id);
        
        if (!hasLocation) {
          try {
            await admin.post(`/inventory-items/${inventoryItem.id}/location-levels`, {
              location_id: defaultLocation.id,
              stocked_quantity: ocQty,
            });
            console.log(`    ✓ Linked to location with quantity: ${ocQty}`);
          } catch (error) {
            console.log(`    ⚠️  Failed to link location: ${error.response?.data?.message || error.message}`);
          }
        } else {
          console.log(`    ✓ Already linked to location`);
        }
        
        // Update dimensions
        const dims = {};
        if (length) {
          // Convert to mm (assuming cm)
          dims.length = Math.round(length * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : lengthUnit.toLowerCase().startsWith('m') ? 1000 : 1));
        }
        if (width) {
          dims.width = Math.round(width * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : lengthUnit.toLowerCase().startsWith('m') ? 1000 : 1));
        }
        if (height) {
          dims.height = Math.round(height * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : lengthUnit.toLowerCase().startsWith('m') ? 1000 : 1));
        }
        if (weight) {
          // Convert to grams (assuming kg)
          dims.weight = Math.round(weight * (weightUnit.toLowerCase().startsWith('kg') ? 1000 : 1));
        }
        
        if (Object.keys(dims).length > 0) {
          try {
            await admin.post(`/inventory-items/${inventoryItem.id}`, dims);
            console.log(`    ✓ Updated dimensions:`, dims);
          } catch (error) {
            console.log(`    ⚠️  Failed to update dimensions: ${error.response?.data?.message || error.message}`);
          }
        }
      }
    }
    
    console.log(`\n✓ Done`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

