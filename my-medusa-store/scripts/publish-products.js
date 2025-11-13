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

async function publishProducts() {
  try {
    // Get all draft products
    const { data } = await client.get('/admin/products', {
      params: { status: ['draft'], limit: 100 }
    });
    
    const products = data?.products || [];
    console.log(`\n📦 Found ${products.length} draft products\n`);
    
    for (const product of products) {
      console.log(`Publishing: ${product.title}`);
      console.log(`  ID: ${product.id}`);
      console.log(`  Current Status: ${product.status}`);
      
      try {
        await client.post(`/admin/products/${product.id}`, {
          status: 'published'
        });
        console.log(`  ✅ Published!\n`);
      } catch (err) {
        console.log(`  ❌ Failed: ${err.message}\n`);
      }
    }
    
    console.log(`✅ Done!`);
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

publishProducts();

