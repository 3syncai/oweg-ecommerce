"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = loadOpencartOrders;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("@medusajs/framework/utils");
const pg_1 = require("pg");
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
    const productModuleService = container.resolve(utils_1.Modules.PRODUCT);
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
async function getOrCreateCustomer(client, customerData) {
    try {
        // Try to find existing customer by email
        const existingResult = await client.query('SELECT id FROM customer WHERE email = $1 AND deleted_at IS NULL LIMIT 1', [customerData.email]);
        if (existingResult.rows.length > 0) {
            return existingResult.rows[0].id;
        }
        // Create new customer using direct DB insertion
        const customerId = generateId();
        await client.query(`INSERT INTO customer (
        id, email, first_name, last_name, phone, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`, [
            customerId,
            customerData.email,
            customerData.first_name || 'Customer',
            customerData.last_name || '',
            customerData.phone || null,
        ]);
        return customerId;
    }
    catch (error) {
        console.error(`   ⚠️  Error creating customer ${customerData.email}:`, error.message);
        return null;
    }
}
/**
 * Create address using direct DB insertion (safe operation)
 * Only touches address table (needed for orders)
 */
async function createAddress(client, addressData) {
    try {
        const addressId = generateId();
        await client.query(`INSERT INTO address (
        id, first_name, last_name, company, address_1, address_2,
        city, postal_code, province, country_code, phone,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`, [
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
        ]);
        return addressId;
    }
    catch (error) {
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
    const orderModuleService = container.resolve(utils_1.Modules.ORDER);
    const regionModuleService = container.resolve(utils_1.Modules.REGION);
    try {
        // Connect to database for all operations
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        const client = new pg_1.Client({
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
            await client.query(`INSERT INTO "order" (
          id, display_id, email, currency_code, region_id, customer_id,
          billing_address_id, shipping_address_id,
          status, payment_status, fulfillment_status,
          subtotal, shipping_total, tax_total, discount_total, total,
          metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`, [
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
            ]);
            // Insert line items (ONLY order_line_item table)
            for (const item of lineItems) {
                const lineItemId = generateId();
                await client.query(`INSERT INTO "order_line_item" (
            id, order_id, variant_id, title, quantity, unit_price,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
                    lineItemId,
                    orderId,
                    item.variant_id,
                    item.title,
                    item.quantity,
                    item.unit_price,
                    JSON.stringify(item.metadata || {}),
                    now,
                    now,
                ]);
            }
            // Return order object
            return {
                id: orderId,
                display_id: orderData.display_id,
                email: orderData.email,
            };
        }
        finally {
            await client.end();
        }
    }
    catch (error) {
        console.error(`   ❌ Error creating order ${orderData.display_id}:`, error.message);
        throw error;
    }
}
/**
 * Main load function (called by medusa exec)
 */
async function loadOrders({ container }) {
    // Path to JSON file (relative to my-medusa-store directory, going up to root)
    const ordersFile = path_1.default.join(__dirname, '..', '..', 'etl', 'orders', 'exports', `medusa-orders-${ORDER_LIMIT}.json`);
    if (!fs_1.default.existsSync(ordersFile)) {
        throw new Error(`❌ Orders file not found: ${ordersFile}\n` +
            `   Run extract.js first: node ../etl/orders/extract.js`);
    }
    console.log(`📖 Reading orders from ${ordersFile}...`);
    const ordersData = JSON.parse(fs_1.default.readFileSync(ordersFile, 'utf-8'));
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
        }
        catch (error) {
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
async function loadOpencartOrders({ container }) {
    return await loadOrders({ container });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZC1vcGVuY2FydC1vcmRlcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zY3JpcHRzL2xvYWQtb3BlbmNhcnQtb3JkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwwREFBMEQ7QUFDMUQ7Ozs7Ozs7Ozs7Ozs7R0FhRzs7Ozs7QUF3V0gscUNBRUM7QUF4V0QsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUN4QixxREFBb0Q7QUFDcEQsMkJBQTRCO0FBRzVCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQjtBQUU5Qyx3REFBd0Q7QUFDeEQsU0FBUyxVQUFVO0lBQ2pCLE9BQU8sc0NBQXNDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFO1FBQ25FLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN4QixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxTQUFTO0lBQzFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEVBQTBFLENBQUMsQ0FBQztJQUV4RixNQUFNLG9CQUFvQixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sV0FBVyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRWhFLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7SUFDMUIsSUFB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