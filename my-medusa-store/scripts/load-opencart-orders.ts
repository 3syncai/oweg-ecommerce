/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * OpenCart to Medusa Order Migration - Load
 * 
 * Loads transformed orders from JSON into Medusa
 * Only touches order-related tables: order, order_line_item, customer, address
 * 
 * Usage:
 *   cd my-medusa-store
 *   npx medusa exec ./scripts/load-opencart-orders.js
 * 
 * Prerequisites:
 *   1. Run extract.js first: node ../etl/orders/extract.js
 *   2. Products must be migrated (for variant_id mapping)
 */

import fs from 'fs';
import path from 'path';
import { Modules } from '@medusajs/framework/utils';
import { Client } from 'pg';
import { ExecArgs } from '@medusajs/framework/types';

const ORDER_LIMIT = 50; // Match extract limit

// Simple UUID generator (no external dependency needed)
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Build product_id to variant_id mapping from Medusa products
 */
async function buildProductMapping(container) {
  console.log('🔍 Building product mapping (OpenCart product_id → Medusa variant_id)...');
  
  const productModuleService = container.resolve(Modules.PRODUCT);
  const allProducts = await productModuleService.listProducts({});
  
  const mapping = new Map();
  let mappedCount = 0;
  
  for (const product of allProducts) {
    const opencartId = product.metadata?.opencart_id;
    if (opencartId && product.variants && product.variants.length > 0) {
      // Use first variant
      mapping.set(parseInt(opencartId), product.variants[0].id);
      mappedCount++;
    }
  }
  
  console.log(`✅ Mapped ${mappedCount} products to variants\n`);
  return mapping;
}

/**
 * Get or create customer using direct DB insertion (safe, idempotent)
 * Only touches customer table (needed for orders)
 */
async function getOrCreateCustomer(client: Client, customerData: any): Promise<string | null> {
  try {
    // Try to find existing customer by email
    const existingResult = await client.query(
      'SELECT id FROM customer WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
      [customerData.email]
    );
    
    if (existingResult.rows.length > 0) {
      return existingResult.rows[0].id;
    }
    
    // Create new customer using direct DB insertion
    const customerId = generateId();
    await client.query(
      `INSERT INTO customer (
        id, email, first_name, last_name, phone, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        customerId,
        customerData.email,
        customerData.first_name || 'Customer',
        customerData.last_name || '',
        customerData.phone || null,
      ]
    );
    
    return customerId;
  } catch (error: any) {
    console.error(`   ⚠️  Error creating customer ${customerData.email}:`, error.message);
    return null;
  }
}

/**
 * Create address using direct DB insertion (safe operation)
 * Only touches address table (needed for orders)
 */
async function createAddress(client: Client, addressData: any): Promise<string | null> {
  try {
    const addressId = generateId();
    await client.query(
      `INSERT INTO address (
        id, first_name, last_name, company, address_1, address_2,
        city, postal_code, province, country_code, phone,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        addressId,
        addressData.first_name || '',
        addressData.last_name || '',
        addressData.company || null,
        addressData.address_1 || '',
        addressData.address_2 || null,
        addressData.city || '',
        addressData.postal_code || '',
        addressData.province || null,
        addressData.country_code || 'in',
        addressData.phone || null,
      ]
    );
    
    return addressId;
  } catch (error: any) {
    console.error('   ⚠️  Error creating address:', error.message);
    return null;
  }
}

/**
 * Create order in Medusa using direct database insertion
 * This is safe and ONLY touches order-related tables (order, order_line_item)
 * Also creates customer/address if needed (safe operations)
 */
async function createOrder(container, orderData, productMapping) {
  const orderModuleService = container.resolve(Modules.ORDER);
  const regionModuleService = container.resolve(Modules.REGION);
  
  try {
    // Connect to database for all operations
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    const client = new Client({
      connectionString: databaseUrl,
    });
    
    await client.connect();
    
    try {
      // Get or create customer (safe operation - only touches customer table)
      const customerId = await getOrCreateCustomer(client, orderData.customer);
      if (!customerId) {
        throw new Error('Failed to create/get customer');
      }
      
      // Create addresses (safe operation - only touches address table)
      const billingAddressId = await createAddress(client, orderData.billing_address);
      const shippingAddressId = await createAddress(client, orderData.shipping_address);
      
      if (!billingAddressId || !shippingAddressId) {
        throw new Error('Failed to create addresses');
      }
    
    // Map line items with variant_ids
    const lineItems = [];
    let skippedItems = 0;
    
    for (const item of orderData.items) {
      const variantId = productMapping.get(item.product_id);
      if (!variantId) {
        skippedItems++;
        console.warn(`   ⚠️  No variant mapping for product_id ${item.product_id}, skipping item`);
        continue;
      }
      
      lineItems.push({
        variant_id: variantId,
        title: item.title,
        quantity: item.quantity,
        unit_price: Math.round(item.unit_price * 100), // Convert to cents
        metadata: {
          opencart_product_id: item.product_id,
          model: item.model,
          options: item.options || [],
        },
      });
    }
    
    if (lineItems.length === 0) {
      throw new Error('No valid line items after mapping');
    }
    
    if (skippedItems > 0) {
      console.log(`   ⚠️  Skipped ${skippedItems} items without variant mapping`);
    }
    
    // Get region for currency
    const regions = await regionModuleService.listRegions({});
    const defaultRegion = regions.find((r) => r.currency_code === orderData.currency_code) || regions[0];
    
    if (!defaultRegion) {
      throw new Error(`No region found for currency ${orderData.currency_code}`);
    }
    
      // Generate order ID
      const orderId = generateId();
      const now = new Date(orderData.created_at);
      const updatedAt = new Date(orderData.updated_at);
      
      // Calculate totals in cents
      const subtotal = Math.round(orderData.totals.subtotal * 100);
      const shippingTotal = Math.round(orderData.totals.shipping_total * 100);
      const taxTotal = Math.round(orderData.totals.tax_total * 100);
      const discountTotal = Math.round(orderData.totals.discount_total * 100);
      const total = Math.round(orderData.totals.total * 100);
      
      // Insert order directly using raw SQL (ONLY order table)
      await client.query(
        `INSERT INTO "order" (
          id, display_id, email, currency_code, region_id, customer_id,
          billing_address_id, shipping_address_id,
          status, payment_status, fulfillment_status,
          subtotal, shipping_total, tax_total, discount_total, total,
          metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          orderId,
          orderData.display_id,
          orderData.email,
          orderData.currency_code,
          defaultRegion.id,
          customerId,
          billingAddressId,
          shippingAddressId,
          orderData.status,
          orderData.payment_status,
          orderData.fulfillment_status,
          subtotal,
          shippingTotal,
          taxTotal,
          discountTotal,
          total,
          JSON.stringify(orderData.metadata || {}),
          now,
          updatedAt,
        ]
      );
      
      // Insert line items (ONLY order_line_item table)
      for (const item of lineItems) {
        const lineItemId = generateId();
        await client.query(
          `INSERT INTO "order_line_item" (
            id, order_id, variant_id, title, quantity, unit_price,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lineItemId,
            orderId,
            item.variant_id,
            item.title,
            item.quantity,
            item.unit_price,
            JSON.stringify(item.metadata || {}),
            now,
            now,
          ]
        );
      }
      
      // Return order object
      return {
        id: orderId,
        display_id: orderData.display_id,
        email: orderData.email,
      };
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error(`   ❌ Error creating order ${orderData.display_id}:`, error.message);
    throw error;
  }
}

/**
 * Main load function (called by medusa exec)
 */
async function loadOrders({ container }: ExecArgs) {
  // Path to JSON file (relative to my-medusa-store directory, going up to root)
  const ordersFile = path.join(__dirname, '..', '..', 'etl', 'orders', 'exports', `medusa-orders-${ORDER_LIMIT}.json`);
  
  if (!fs.existsSync(ordersFile)) {
    throw new Error(
      `❌ Orders file not found: ${ordersFile}\n` +
      `   Run extract.js first: node ../etl/orders/extract.js`
    );
  }
  
  console.log(`📖 Reading orders from ${ordersFile}...`);
  const ordersData = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
  console.log(`✅ Loaded ${ordersData.length} orders\n`);
  
  // Build product mapping
  const productMapping = await buildProductMapping(container);
  
  if (productMapping.size === 0) {
    console.warn('⚠️  Warning: No product mappings found. Orders may fail to create.');
    console.warn('   Make sure products are migrated first.\n');
  }
  
  let migrated = 0;
  let failed = 0;
  const errors = [];
  
  console.log(`🚀 Starting order migration...\n`);
  
  for (let i = 0; i < ordersData.length; i++) {
    const orderData = ordersData[i];
    
    try {
      console.log(`[${i + 1}/${ordersData.length}] Migrating order #${orderData.display_id}...`);
      
      const order = await createOrder(container, orderData, productMapping);
      
      migrated++;
      console.log(`   ✅ Success: Order #${orderData.display_id} (ID: ${order?.id || 'N/A'})\n`);
      
    } catch (error) {
      failed++;
      const errorMsg = `   ❌ Failed: ${error.message}`;
      console.error(errorMsg);
      errors.push({ 
        order_id: orderData.display_id, 
        error: error.message 
      });
      console.log(''); // Empty line
    }
    
    // Progress update every 10 orders
    if ((i + 1) % 10 === 0) {
      console.log(`📊 Progress: ${migrated} migrated, ${failed} failed\n`);
    }
  }
  
  console.log(`\n✅ Migration Complete!`);
  console.log(`   - Total: ${ordersData.length}`);
  console.log(`   - Migrated: ${migrated}`);
  console.log(`   - Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors (showing first 10):`);
    errors.slice(0, 10).forEach((e) => {
      console.log(`   - Order #${e.order_id}: ${e.error}`);
    });
    if (errors.length > 10) {
      console.log(`   ... and ${errors.length - 10} more`);
    }
  }
  
  if (migrated > 0) {
    console.log(`\n🎉 Successfully migrated ${migrated} orders!`);
    console.log(`   Check Medusa admin to verify orders.`);
  }
}

// Export for Medusa exec (TypeScript default export)
import { ExecArgs } from "@medusajs/framework/types";

export default async function loadOpencartOrders({ container }: ExecArgs) {
  return await loadOrders({ container });
}

