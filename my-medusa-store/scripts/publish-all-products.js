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

async function publishAllProducts() {
  try {
    console.log('Fetching all draft products...\n');
    
    // Fetch all products
    const { data: productsData } = await client.get('/products', {
      params: { 
        limit: 1000,
        status: ['draft'] // Only get draft products (as array)
      }
    });
    
    const products = productsData.products || [];
    
    if (products.length === 0) {
      console.log('✓ No draft products found. All products are already published!');
      return;
    }
    
    console.log(`Found ${products.length} draft products to publish\n`);
    
    let published = 0;
    let failed = 0;
    
    for (const product of products) {
      try {
        await client.post(`/products/${product.id}`, {
          status: 'published'
        });
        console.log(`✓ Published: ${product.title}`);
        published++;
      } catch (error) {
        console.error(`✗ Failed to publish ${product.title}:`, error.response?.data?.message || error.message);
        failed++;
      }
    }
    
    console.log(`\n✅ Done! Published ${published} products`);
    if (failed > 0) {
      console.log(`⚠️  Failed to publish ${failed} products`);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

publishAllProducts();

