// scripts/medusa-flush.js
// ESM style. Optional: add `"type": "module"` to package.json to silence the warning.
import dotenv from "dotenv";
import axios from "axios";

// Load .env file
dotenv.config();

const BASE = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_KEY = process.env.MEDUSA_ADMIN_BASIC;

if (!ADMIN_KEY) {
  console.error("Missing MEDUSA_ADMIN_BASIC env var.");
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    // IMPORTANT: Medusa v2 admin keys use raw token after 'Basic ' (no base64)
    Authorization: `Basic ${ADMIN_KEY}`,
  },
});

async function list(path, key, limit = 100) {
  const { data } = await client.get(path, { params: { limit, offset: 0 } });
  return data?.[key] ?? [];
}

async function del(path, id, label) {
  try {
    await client.delete(`${path}/${id}`);
    console.log(`  ✓ deleted ${label}: ${id}`);
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    console.log(`  ✗ failed to delete ${label} ${id}: ${msg}`);
  }
}

async function wipe(path, key, human) {
  console.log(`🧹 Deleting ${human}…`);
  while (true) {
    const items = await list(path, key, 100);
    if (items.length === 0) break;
    for (const item of items) {
      await del(path, item.id, human.slice(0, -1));
    }
  }
}

(async () => {
  try {
    // Delete in safe order
    await wipe("/admin/products", "products", "products");
    await wipe("/admin/collections", "collections", "collections");
    await wipe("/admin/product-categories", "product_categories", "categories");
    await wipe("/admin/product-tags", "product_tags", "tags");
    console.log("✅ Medusa cleanup completed.");
  } catch (e) {
    console.error("❌ Cleanup failed:", e.message);
    if (e.response) {
      console.error("Response status:", e.response.status);
      console.error("Response data:", JSON.stringify(e.response.data, null, 2));
    }
    console.error("Stack:", e.stack);
    process.exit(1);
  }
})();

