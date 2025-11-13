const axios = require('axios');

const MEDUSA_URL = process.env.MEDUSA_URL || 'http://localhost:9000';
const MEDUSA_ADMIN_BASIC = process.env.MEDUSA_ADMIN_BASIC;

if (!MEDUSA_ADMIN_BASIC) {
  console.error('Error: MEDUSA_ADMIN_BASIC environment variable is required');
  process.exit(1);
}

const client = axios.create({
  baseURL: `${MEDUSA_URL}/admin`,
  headers: {
    'Authorization': `Basic ${MEDUSA_ADMIN_BASIC}`,
    'Content-Type': 'application/json',
  },
});

// Conversion functions - keep in cm and kg for UI display
function toCm(value, unit) {
  if (!value || value === 0) return undefined;
  if (!unit) return Math.round(value * 10) / 10;
  
  const normalized = unit.toLowerCase();
  if (normalized.includes('cm') || normalized.includes('centimeter')) {
    return Math.round(value * 10) / 10;
  }
  if (normalized.includes('mm') || normalized.includes('millimeter')) {
    return Math.round(value / 10 * 10) / 10;
  }
  if (normalized.includes('m') && !normalized.includes('mm') && !normalized.includes('cm')) {
    return Math.round(value * 100 * 10) / 10;
  }
  return Math.round(value * 10) / 10;
}

function toKg(value, unit) {
  if (!value || value === 0) return undefined;
  if (!unit) return Math.round(value * 100) / 100;
  
  const normalized = unit.toLowerCase();
  if (normalized.includes('kg') || normalized.includes('kilogram')) {
    return Math.round(value * 100) / 100;
  }
  if (normalized.includes('g') && !normalized.includes('kg')) {
    return Math.round(value / 1000 * 100) / 100;
  }
  return Math.round(value * 100) / 100;
}

async function fixAllAttributes() {
  try {
    console.log('Fetching all products...\n');
    
    const { data: productsData } = await client.get('/products', {
      params: { limit: 1000 }
    });
    
    const products = productsData.products || [];
    console.log(`Found ${products.length} products\n`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const product of products) {
      const metadata = product.metadata || {};
      
      // Check if product has dimension metadata
      const hasMetadata = metadata.length || metadata.width || metadata.height || metadata.weight;
      
      if (!hasMetadata) {
        console.log(`⊘ Skipping ${product.title} - no dimension metadata`);
        skipped++;
        continue;
      }
      
      // Extract original values and units from metadata
      const length = parseFloat(metadata.length);
      const width = parseFloat(metadata.width);
      const height = parseFloat(metadata.height);
      const weight = parseFloat(metadata.weight);
      const lengthUnit = metadata.length_unit || metadata.oc_length_unit;
      const weightUnit = metadata.weight_unit || metadata.oc_weight_unit;
      
      // Convert to proper units (cm and kg for UI)
      const lengthCm = toCm(length, lengthUnit);
      const widthCm = toCm(width, lengthUnit);
      const heightCm = toCm(height, lengthUnit);
      const weightKg = toKg(weight, weightUnit);
      
      // Extract mid_code from metadata
      const midCode = (metadata.oc_mpn && metadata.oc_mpn.trim()) || 
                      (metadata.oc_model && metadata.oc_model.trim()) || 
                      undefined;
      const hsCode = (metadata.oc_upc && metadata.oc_upc.trim()) || undefined;
      
      // Build update payload
      const updatePayload = {};
      
      if (lengthCm !== undefined) updatePayload.length = lengthCm;
      if (widthCm !== undefined) updatePayload.width = widthCm;
      if (heightCm !== undefined) updatePayload.height = heightCm;
      if (weightKg !== undefined) updatePayload.weight = weightKg;
      if (midCode) updatePayload.mid_code = midCode;
      if (hsCode) updatePayload.hs_code = hsCode;
      
      // Check if update is needed
      if (Object.keys(updatePayload).length === 0) {
        console.log(`⊘ Skipping ${product.title} - no updates needed`);
        skipped++;
        continue;
      }
      
      try {
        await client.post(`/products/${product.id}`, updatePayload);
        console.log(`✓ Updated ${product.title}`);
        console.log(`  Length: ${length} ${lengthUnit} → ${lengthCm} cm`);
        console.log(`  Width: ${width} ${lengthUnit} → ${widthCm} cm`);
        console.log(`  Height: ${height} ${lengthUnit} → ${heightCm} cm`);
        console.log(`  Weight: ${weight} ${weightUnit} → ${weightKg} kg`);
        if (midCode) console.log(`  MID Code: ${midCode}`);
        if (hsCode) console.log(`  HS Code: ${hsCode}`);
        console.log('');
        updated++;
      } catch (error) {
        console.error(`✗ Failed to update ${product.title}:`, error.response?.data || error.message);
      }
    }
    
    console.log(`\n✅ Done! Updated ${updated} products, skipped ${skipped}`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

fixAllAttributes();

