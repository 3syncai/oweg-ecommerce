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

async function verify() {
  try {
    // Get product counts
    const productsResp = await client.get('/admin/products', { params: { limit: 1 } });
    const totalProducts = productsResp.data?.count || 0;

    const publishedResp = await client.get('/admin/products', { 
      params: { status: ['published'], limit: 1 } 
    });
    const publishedCount = publishedResp.data?.count || 0;

    const draftResp = await client.get('/admin/products', { 
      params: { status: ['draft'], limit: 1 } 
    });
    const draftCount = draftResp.data?.count || 0;

    // Get inventory count
    const invResp = await client.get('/admin/inventory-items', { params: { limit: 1 } });
    const inventoryCount = invResp.data?.count || 0;

    // Get categories count
    const catResp = await client.get('/admin/product-categories', { params: { limit: 1 } });
    const categoriesCount = catResp.data?.count || 0;

    // Get collections count
    const collResp = await client.get('/admin/collections', { params: { limit: 1 } });
    const collectionsCount = collResp.data?.count || 0;

    // Get tags count
    const tagsResp = await client.get('/admin/product-tags', { params: { limit: 1 } });
    const tagsCount = tagsResp.data?.count || 0;

    console.log(`\n============================================`);
    console.log(`Migration Summary:`);
    console.log(`============================================`);
    console.log(`SUCCESS: Total Products: ${totalProducts}`);
    console.log(`   - Published: ${publishedCount}`);
    console.log(`   - Draft: ${draftCount}`);
    console.log(`SUCCESS: Inventory Items: ${inventoryCount}`);
    console.log(`SUCCESS: Categories: ${categoriesCount}`);
    console.log(`SUCCESS: Collections: ${collectionsCount}`);
    console.log(`SUCCESS: Tags: ${tagsCount}`);
    console.log(`============================================\n`);

  } catch (err) {
    console.error('ERROR: Verification error:', err.message);
  }
}

verify();

