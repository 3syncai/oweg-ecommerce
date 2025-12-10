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
// import { ExecArgs } from '@medusajs/framework/types'; // ExecArgs not found
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
// Export for Medusa exec (TypeScript default export)
// import { ExecArgs } from "@medusajs/framework/types";
async function loadOpencartOrders({ container }) {
    return await loadOrders({ container });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZC1vcGVuY2FydC1vcmRlcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zY3JpcHRzL2xvYWQtb3BlbmNhcnQtb3JkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwwREFBMEQ7QUFDMUQ7Ozs7Ozs7Ozs7Ozs7R0FhRzs7Ozs7QUF3V0gscUNBRUM7QUF4V0QsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUN4QixxREFBb0Q7QUFDcEQsMkJBQTRCO0FBQzVCLDhFQUE4RTtBQUU5RSxNQUFNLFdBQVcsR0FBRyxFQUFFLENBQUMsQ0FBQyxzQkFBc0I7QUFFOUMsd0RBQXdEO0FBQ3hELFNBQVMsVUFBVTtJQUNqQixPQUFPLHNDQUFzQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRTtRQUNuRSxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztRQUMxQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDeEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsbUJBQW1CLENBQUMsU0FBUztJQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBFQUEwRSxDQUFDLENBQUM7SUFFeEYsTUFBTSxvQkFBb0IsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRSxNQUFNLFdBQVcsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVoRSxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQzFCLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztJQUVwQixLQUFLLE1BQU0sT0FBTyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO1FBQ2pELElBQUksVUFBVSxJQUFJLE9BQU8sQ0FBQyxRQUFRLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbEUsb0JBQW9CO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUQsV0FBVyxFQUFFLENBQUM7UUFDaEIsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksV0FBVyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzlELE9BQU8sT0FBTyxDQUFDO0FBQ2pCLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxLQUFLLFVBQVUsbUJBQW1CLENBQUMsTUFBYyxFQUFFLFlBQWlCO0lBQ2xFLElBQUksQ0FBQztRQUNILHlDQUF5QztRQUN6QyxNQUFNLGNBQWMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQ3ZDLHlFQUF5RSxFQUN6RSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FDckIsQ0FBQztRQUVGLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkMsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBRUQsZ0RBQWdEO1FBQ2hELE1BQU0sVUFBVSxHQUFHLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FDaEI7O2tEQUU0QyxFQUM1QztZQUNFLFVBQVU7WUFDVixZQUFZLENBQUMsS0FBSztZQUNsQixZQUFZLENBQUMsVUFBVSxJQUFJLFVBQVU7WUFDckMsWUFBWSxDQUFDLFNBQVMsSUFBSSxFQUFFO1lBQzVCLFlBQVksQ0FBQyxLQUFLLElBQUksSUFBSTtTQUMzQixDQUNGLENBQUM7UUFFRixPQUFPLFVBQVUsQ0FBQztJQUNwQixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxZQUFZLENBQUMsS0FBSyxHQUFHLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RGLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRDs7O0dBR0c7QUFDSCxLQUFLLFVBQVUsYUFBYSxDQUFDLE1BQWMsRUFBRSxXQUFnQjtJQUMzRCxJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxVQUFVLEVBQUUsQ0FBQztRQUMvQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQ2hCOzs7OzRFQUlzRSxFQUN0RTtZQUNFLFNBQVM7WUFDVCxXQUFXLENBQUMsVUFBVSxJQUFJLEVBQUU7WUFDNUIsV0FBVyxDQUFDLFNBQVMsSUFBSSxFQUFFO1lBQzNCLFdBQVcsQ0FBQyxPQUFPLElBQUksSUFBSTtZQUMzQixXQUFXLENBQUMsU0FBUyxJQUFJLEVBQUU7WUFDM0IsV0FBVyxDQUFDLFNBQVMsSUFBSSxJQUFJO1lBQzdCLFdBQVcsQ0FBQyxJQUFJLElBQUksRUFBRTtZQUN0QixXQUFXLENBQUMsV0FBVyxJQUFJLEVBQUU7WUFDN0IsV0FBVyxDQUFDLFFBQVEsSUFBSSxJQUFJO1lBQzVCLFdBQVcsQ0FBQyxZQUFZLElBQUksSUFBSTtZQUNoQyxXQUFXLENBQUMsS0FBSyxJQUFJLElBQUk7U0FDMUIsQ0FDRixDQUFDO1FBRUYsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxLQUFLLFVBQVUsV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsY0FBYztJQUM3RCxNQUFNLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVELE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFOUQsSUFBSSxDQUFDO1FBQ0gseUNBQXlDO1FBQ3pDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLDhDQUE4QyxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLElBQUksV0FBTSxDQUFDO1lBQ3hCLGdCQUFnQixFQUFFLFdBQVc7U0FDOUIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFdkIsSUFBSSxDQUFDO1lBQ0gsd0VBQXdFO1lBQ3hFLE1BQU0sVUFBVSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN6RSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUNuRCxDQUFDO1lBRUQsaUVBQWlFO1lBQ2pFLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxhQUFhLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNoRixNQUFNLGlCQUFpQixHQUFHLE1BQU0sYUFBYSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUVsRixJQUFJLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUM1QyxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUVILGtDQUFrQztZQUNsQyxNQUFNLFNBQVMsR0FBVSxFQUFFLENBQUM7WUFDNUIsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBRXJCLEtBQUssTUFBTSxJQUFJLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNuQyxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDdEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNmLFlBQVksRUFBRSxDQUFDO29CQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLElBQUksQ0FBQyxVQUFVLGlCQUFpQixDQUFDLENBQUM7b0JBQzNGLFNBQVM7Z0JBQ1gsQ0FBQztnQkFFRCxTQUFTLENBQUMsSUFBSSxDQUFDO29CQUNiLFVBQVUsRUFBRSxTQUFTO29CQUNyQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7b0JBQ2pCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtvQkFDdkIsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsRUFBRSxtQkFBbUI7b0JBQ2xFLFFBQVEsRUFBRTt3QkFDUixtQkFBbUIsRUFBRSxJQUFJLENBQUMsVUFBVTt3QkFDcEMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sSUFBSSxFQUFFO3FCQUM1QjtpQkFDRixDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsSUFBSSxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMzQixNQUFNLElBQUksS0FBSyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUVELElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixZQUFZLGdDQUFnQyxDQUFDLENBQUM7WUFDOUUsQ0FBQztZQUVELDBCQUEwQjtZQUMxQixNQUFNLE9BQU8sR0FBRyxNQUFNLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMxRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxLQUFLLFNBQVMsQ0FBQyxhQUFhLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFckcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixNQUFNLElBQUksS0FBSyxDQUFDLGdDQUFnQyxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztZQUM3RSxDQUFDO1lBRUMsb0JBQW9CO1lBQ3BCLE1BQU0sT0FBTyxHQUFHLFVBQVUsRUFBRSxDQUFDO1lBQzdCLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMzQyxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFakQsNEJBQTRCO1lBQzVCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDN0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUN4RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQzlELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDeEUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQztZQUV2RCx5REFBeUQ7WUFDekQsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUNoQjs7Ozs7O3dHQU1nRyxFQUNoRztnQkFDRSxPQUFPO2dCQUNQLFNBQVMsQ0FBQyxVQUFVO2dCQUNwQixTQUFTLENBQUMsS0FBSztnQkFDZixTQUFTLENBQUMsYUFBYTtnQkFDdkIsYUFBYSxDQUFDLEVBQUU7Z0JBQ2hCLFVBQVU7Z0JBQ1YsZ0JBQWdCO2dCQUNoQixpQkFBaUI7Z0JBQ2pCLFNBQVMsQ0FBQyxNQUFNO2dCQUNoQixTQUFTLENBQUMsY0FBYztnQkFDeEIsU0FBUyxDQUFDLGtCQUFrQjtnQkFDNUIsUUFBUTtnQkFDUixhQUFhO2dCQUNiLFFBQVE7Z0JBQ1IsYUFBYTtnQkFDYixLQUFLO2dCQUNMLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQ3hDLEdBQUc7Z0JBQ0gsU0FBUzthQUNWLENBQ0YsQ0FBQztZQUVGLGlEQUFpRDtZQUNqRCxLQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUM3QixNQUFNLFVBQVUsR0FBRyxVQUFVLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUNoQjs7O3dEQUc4QyxFQUM5QztvQkFDRSxVQUFVO29CQUNWLE9BQU87b0JBQ1AsSUFBSSxDQUFDLFVBQVU7b0JBQ2YsSUFBSSxDQUFDLEtBQUs7b0JBQ1YsSUFBSSxDQUFDLFFBQVE7b0JBQ2IsSUFBSSxDQUFDLFVBQVU7b0JBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQztvQkFDbkMsR0FBRztvQkFDSCxHQUFHO2lCQUNKLENBQ0YsQ0FBQztZQUNKLENBQUM7WUFFRCxzQkFBc0I7WUFDdEIsT0FBTztnQkFDTCxFQUFFLEVBQUUsT0FBTztnQkFDWCxVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVU7Z0JBQ2hDLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSzthQUN2QixDQUFDO1FBQ0osQ0FBQztnQkFBUyxDQUFDO1lBQ1QsTUFBTSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDckIsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsU0FBUyxDQUFDLFVBQVUsR0FBRyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuRixNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLEVBQUUsU0FBUyxFQUFPO0lBQzFDLDhFQUE4RTtJQUM5RSxNQUFNLFVBQVUsR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixXQUFXLE9BQU8sQ0FBQyxDQUFDO0lBRXJILElBQUksQ0FBQyxZQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FDYiw0QkFBNEIsVUFBVSxJQUFJO1lBQzFDLHdEQUF3RCxDQUN6RCxDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLFVBQVUsS0FBSyxDQUFDLENBQUM7SUFDdkQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFFLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxVQUFVLENBQUMsTUFBTSxXQUFXLENBQUMsQ0FBQztJQUV0RCx3QkFBd0I7SUFDeEIsTUFBTSxjQUFjLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUU1RCxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQyxvRUFBb0UsQ0FBQyxDQUFDO1FBQ25GLE9BQU8sQ0FBQyxJQUFJLENBQUMsNkNBQTZDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQ2pCLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNmLE1BQU0sTUFBTSxHQUFVLEVBQUUsQ0FBQztJQUV6QixPQUFPLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7SUFFaEQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMzQyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLE1BQU0sc0JBQXNCLFNBQVMsQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUFDO1lBRTNGLE1BQU0sS0FBSyxHQUFHLE1BQU0sV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFFdEUsUUFBUSxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixTQUFTLENBQUMsVUFBVSxTQUFTLEtBQUssRUFBRSxFQUFFLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztRQUU1RixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sRUFBRSxDQUFDO1lBQ1QsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqRCxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ1YsUUFBUSxFQUFFLFNBQVMsQ0FBQyxVQUFVO2dCQUM5QixLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU87YUFDckIsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWE7UUFDaEMsQ0FBQztRQUVELGtDQUFrQztRQUNsQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixRQUFRLGNBQWMsTUFBTSxXQUFXLENBQUMsQ0FBQztRQUN2RSxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDaEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBRXRDLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDaEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLE1BQU0sQ0FBQyxNQUFNLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN2RCxDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2pCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLFFBQVEsVUFBVSxDQUFDLENBQUM7UUFDOUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO0lBQ3pELENBQUM7QUFDSCxDQUFDO0FBRUQscURBQXFEO0FBQ3JELHdEQUF3RDtBQUV6QyxLQUFLLFVBQVUsa0JBQWtCLENBQUMsRUFBRSxTQUFTLEVBQU87SUFDakUsT0FBTyxNQUFNLFVBQVUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFDekMsQ0FBQyJ9