/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * OpenCart to Medusa Order Migration - Load
 * 
 * Loads transformed orders from JSON into Medusa
 * Only touches order-related tables: order, order_line_item, customer, address
 * 
 * Usage:
 *   cd my-medusa-store
 *   npx medusa exec ./scripts/migrate-opencart-orders-load.js
 * 
 * Prerequisites:
 *   1. Run extract.js first to generate exports/medusa-orders-50.json
 *   2. Products must be migrated (for variant_id mapping)
 */

const fs = require('fs');
const path = require('path');
const { Modules } = require('@medusajs/framework/utils');

// Simple UUID generator (no external dependency needed)
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const ORDER_LIMIT = 50; // Match extract limit

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
 * Get or create customer (safe, idempotent)
 */
async function getOrCreateCustomer(container, customerData) {
  const customerModuleService = container.resolve(Modules.CUSTOMER);
  
  try {
    // Try to find by email
    const existing = await customerModuleService.listCustomers({
      email: customerData.email,
    });
    
    if (existing && existing.length > 0) {
      return existing[0].id;
    }
    
    // Create new customer
    const [newCustomer] = await customerModuleService.createCustomers({
      email: customerData.email,
      first_name: customerData.first_name || 'Customer',
      last_name: customerData.last_name || '',
      phone: customerData.phone || null,
    });
    
    return newCustomer.id;
  } catch (error) {
    console.error(`   ⚠️  Error creating customer ${customerData.email}:`, error.message);
    return null;
  }
}

/**
 * Create address (safe operation)
 */
async function createAddress(container, addressData) {
  const customerModuleService = container.resolve(Modules.CUSTOMER);
  
  try {
    const [address] = await customerModuleService.createAddresses({
      first_name: addressData.first_name || '',
      last_name: addressData.last_name || '',
      company: addressData.company || null,
      address_1: addressData.address_1 || '',
      address_2: addressData.address_2 || null,
      city: addressData.city || '',
      postal_code: addressData.postal_code || '',
      province: addressData.province || null,
      country_code: addressData.country_code || 'in',
      phone: addressData.phone || null,
    });
    
    return address.id;
  } catch (error) {
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
  const regionModuleService = container.resolve(Modules.REGION);
  
  try {
    // Get or create customer (safe operation)
    const customerId = await getOrCreateCustomer(container, orderData.customer);
    if (!customerId) {
      throw new Error('Failed to create/get customer');
    }
    
    // Create addresses (safe operation)
    const billingAddressId = await createAddress(container, orderData.billing_address);
    const shippingAddressId = await createAddress(container, orderData.shipping_address);
    
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
    
    // Use MikroORM entity manager for direct database insertion
    // This is safe and ONLY touches order-related tables
    const manager = container.resolve('manager'); // MikroORM entity manager
    
    if (!manager) {
      throw new Error('Entity manager not available');
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
    
    // Insert order directly using raw query (ONLY order table)
    await manager.nativeInsert('order', {
      id: orderId,
      display_id: orderData.display_id,
      email: orderData.email,
      currency_code: orderData.currency_code,
      region_id: defaultRegion.id,
      customer_id: customerId,
      billing_address_id: billingAddressId,
      shipping_address_id: shippingAddressId,
      status: orderData.status,
      payment_status: orderData.payment_status,
      fulfillment_status: orderData.fulfillment_status,
      subtotal: subtotal,
      shipping_total: shippingTotal,
      tax_total: taxTotal,
      discount_total: discountTotal,
      total: total,
      metadata: orderData.metadata || {},
      created_at: now,
      updated_at: updatedAt,
    });
    
    // Insert line items (ONLY order_line_item table)
    for (const item of lineItems) {
      const lineItemId = generateId();
      await manager.nativeInsert('order_line_item', {
        id: lineItemId,
        order_id: orderId,
        variant_id: item.variant_id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        metadata: item.metadata || {},
        created_at: now,
        updated_at: now,
      });
    }
    
    // Return order object
    return {
      id: orderId,
      display_id: orderData.display_id,
      email: orderData.email,
    };
  } catch (error) {
    console.error(`   ❌ Error creating order ${orderData.display_id}:`, error.message);
    throw error;
  }
}

/**
 * Main load function (called by medusa exec)
 */
async function loadOrders({ container }) {
  // Path to JSON file (relative to project root)
  const ordersFile = path.join(process.cwd(), '..', 'etl', 'orders', 'exports', `medusa-orders-${ORDER_LIMIT}.json`);
  
  if (!fs.existsSync(ordersFile)) {
    throw new Error(
      `❌ Orders file not found: ${ordersFile}\n` +
      `   Run extract.js first: node etl/orders/extract.js`
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

// Export for Medusa exec (must be default export)
// Export as object with default property to satisfy medusa exec
module.exports = {
  default: loadOrders
};

