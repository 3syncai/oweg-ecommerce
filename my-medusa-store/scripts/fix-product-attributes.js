#!/usr/bin/env node
/**
 * Fix product attributes by updating product table columns
 * from metadata values
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
    console.log('Fetching products...');
    const { data } = await admin.get('/products?limit=100');
    const products = data.products || [];
    
    console.log(`Found ${products.length} products\n`);
    
    for (const product of products) {
      console.log(`\nProduct: ${product.title}`);
      console.log(`  ID: ${product.id}`);
      
      const metadata = product.metadata || {};
      
      // Get dimensions from metadata
      const length = metadata.length ? parseFloat(metadata.length) : null;
      const width = metadata.width ? parseFloat(metadata.width) : null;
      const height = metadata.height ? parseFloat(metadata.height) : null;
      const weight = metadata.weight ? parseFloat(metadata.weight) : null;
      const lengthUnit = metadata.length_unit || 'cm';
      const weightUnit = metadata.weight_unit || 'kg';
      
      if (!length && !width && !height && !weight) {
        console.log('  ⚠️  No dimensions in metadata, skipping');
        continue;
      }
      
      console.log(`  Dimensions: ${length}x${width}x${height} ${lengthUnit}, ${weight} ${weightUnit}`);
      
      // Update product with dimension numbers
      // Note: Medusa stores these as integers (mm for dimensions, grams for weight)
      const updates = {};
      
      // Convert to mm (assuming cm)
      if (length) {
        updates.length = Math.round(length * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : 1));
      }
      if (width) {
        updates.width = Math.round(width * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : 1));
      }
      if (height) {
        updates.height = Math.round(height * (lengthUnit.toLowerCase().startsWith('cm') ? 10 : 1));
      }
      // Convert to grams (assuming kg)
      if (weight) {
        updates.weight = Math.round(weight * (weightUnit.toLowerCase().startsWith('kg') ? 1000 : weightUnit.toLowerCase().startsWith('g') && !weightUnit.toLowerCase().startsWith('gram') ? 1 : 1));
      }
      
      try {
        await admin.post(`/products/${product.id}`, updates);
        console.log(`  ✓ Updated product attributes:`, updates);
      } catch (error) {
        console.log(`  ⚠️  Failed to update: ${error.response?.data?.message || error.message}`);
      }
    }
    
    console.log(`\n✓ Done`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

