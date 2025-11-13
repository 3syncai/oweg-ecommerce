#!/usr/bin/env node
/**
 * Fix existing migrated products:
 * 1. Update prices from USD to INR (paise)
 * 2. Link inventory to Default location
 * 3. Update variant dimensions
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

async function fixProduct(productId) {
  console.log(`\nFixing product: ${productId}`);
  
  // Get product details
  const { data: productData } = await admin.get(`/products/${productId}`);
  const product = productData.product;
  
  console.log(`  Title: ${product.title}`);
  console.log(`  Metadata:`, product.metadata);
  
  // Get OC price from metadata
  const ocPriceRupees = product.metadata?.oc_price_rupees;
  if (!ocPriceRupees) {
    console.log(`  ⚠️  No oc_price_rupees in metadata, skipping price fix`);
    return;
  }
  
  const pricePaise = Math.round(parseFloat(ocPriceRupees) * 100);
  console.log(`  OC Price: ₹${ocPriceRupees} → ${pricePaise} paise`);
  
  // Get default location
  const { data: locData } = await admin.get('/stock-locations?name=Default');
  const defaultLocation = locData.stock_locations?.[0];
  if (!defaultLocation) {
    console.log(`  ⚠️  No Default location found`);
    return;
  }
  console.log(`  Default location: ${defaultLocation.id}`);
  
  // Fix each variant
  for (const variant of product.variants || []) {
    console.log(`\n  Variant: ${variant.id} (SKU: ${variant.sku})`);
    
    // 1. Fix price
    try {
      const { data: priceSetData } = await admin.get(`/price-sets/${variant.price_set_id}`);
      const priceSet = priceSetData.price_set;
      
      for (const price of priceSet.prices || []) {
        console.log(`    Current price: ${price.amount} ${price.currency_code}`);
        
        if (price.currency_code === 'usd') {
          // Update to INR
          await admin.post(`/prices/${price.id}`, {
            currency_code: 'inr',
            amount: pricePaise,
          });
          console.log(`    ✓ Updated price: ${pricePaise} inr`);
        } else if (price.currency_code === 'inr' && price.amount !== pricePaise) {
          // Update amount
          await admin.post(`/prices/${price.id}`, {
            amount: pricePaise,
          });
          console.log(`    ✓ Updated amount: ${pricePaise} inr`);
        }
      }
    } catch (error) {
      console.log(`    ⚠️  Price update failed: ${error.message}`);
    }
    
    // 2. Fix inventory
    try {
      const { data: invData } = await admin.get(`/inventory-items?sku=${variant.sku}`);
      const inventoryItem = invData.inventory_items?.[0];
      
      if (inventoryItem) {
        console.log(`    Inventory item: ${inventoryItem.id}`);
        
        // Check if location is linked
        const { data: levelData } = await admin.get(`/inventory-items/${inventoryItem.id}/location-levels`);
        const hasLocation = levelData.inventory_levels?.some(l => l.location_id === defaultLocation.id);
        
        if (!hasLocation) {
          // Link to default location
          const ocQty = product.metadata?.oc_qty || 0;
          await admin.post(`/inventory-items/${inventoryItem.id}/location-levels`, {
            location_id: defaultLocation.id,
            stocked_quantity: ocQty,
          });
          console.log(`    ✓ Linked to location with quantity: ${ocQty}`);
        }
        
        // 3. Fix dimensions
        const dims = {};
        if (product.metadata?.length) dims.length = Math.round(parseFloat(product.metadata.length) * 10); // cm to mm
        if (product.metadata?.width) dims.width = Math.round(parseFloat(product.metadata.width) * 10);
        if (product.metadata?.height) dims.height = Math.round(parseFloat(product.metadata.height) * 10);
        if (product.metadata?.weight) dims.weight = Math.round(parseFloat(product.metadata.weight) * 1000); // kg to g
        
        if (Object.keys(dims).length > 0) {
          await admin.post(`/inventory-items/${inventoryItem.id}`, dims);
          console.log(`    ✓ Updated dimensions:`, dims);
        }
      }
    } catch (error) {
      console.log(`    ⚠️  Inventory update failed: ${error.message}`);
    }
  }
  
  console.log(`  ✓ Product fixed`);
}

async function main() {
  try {
    // Get all products
    console.log('Fetching products...');
    const { data } = await admin.get('/products?limit=100');
    const products = data.products || [];
    
    console.log(`Found ${products.length} products to fix\n`);
    
    for (const product of products) {
      try {
        await fixProduct(product.id);
      } catch (error) {
        console.error(`Error fixing product ${product.id}:`, error.message);
        if (error.response?.data) {
          console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.stack) {
          console.error('Stack:', error.stack);
        }
      }
    }
    
    console.log(`\n✓ All products fixed`);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

