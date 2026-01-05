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

async function flushNProducts(count) {
  try {
    console.log(`Fetching ${count} products to delete...\n`);
    
    const { data: productsData } = await client.get('/products', {
      params: { 
        limit: count,
        order: '-created_at' // Get newest first
      }
    });
    
    const products = productsData.products || [];
    
    if (products.length === 0) {
      console.log('No products found to delete.');
      return;
    }
    
    console.log(`Found ${products.length} products to delete\n`);
    
    let deleted = 0;
    
    for (const product of products) {
      try {
        await client.delete(`/products/${product.id}`);
        console.log(`✓ Deleted: ${product.title} (${product.id})`);
        deleted++;
      } catch (error) {
        console.error(`✗ Failed to delete ${product.title}:`, error.response?.data?.message || error.message);
      }
    }
    
    console.log(`\n✅ Done! Deleted ${deleted} out of ${products.length} products`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Get count from command line argument
const count = parseInt(process.argv[2]) || 2;

if (count < 1) {
  console.error('Error: Count must be a positive number');
  process.exit(1);
}

console.log(`Flushing ${count} products...\n`);
flushNProducts(count);

