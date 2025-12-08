// // import { ExecArgs } from "@medusajs/framework/types";
import fs from "fs";
import path from "path";
import { Modules } from "@medusajs/framework/utils";
import { Client } from "pg";

const ORDER_LIMIT = 50; // Match extract limit

// Simple UUID generator
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Build product_id to variant_id mapping from Medusa products
 * Uses direct database query for reliability
 */
async function buildProductMapping(container: any, client: Client) {
  console.log(
    "🔍 Building product mapping (OpenCart product_id → Medusa variant_id)..."
  );

  const mapping = new Map<number, string>();
  let mappedCount = 0;

  // Query database directly to find products with opencart_id in metadata
  try {
    // First, try to find products with opencart_id
    const result = await client.query(`
      SELECT 
        p.id as product_id,
        p.metadata->>'opencart_id' as opencart_id,
        pv.id as variant_id,
        p.title as product_title
      FROM "product" p
      INNER JOIN "product_variant" pv ON p.id = pv.product_id
      WHERE p.metadata->>'opencart_id' IS NOT NULL
        AND p.metadata->>'opencart_id' != 'null'
        AND p.metadata->>'opencart_id' != ''
      ORDER BY pv.created_at ASC
    `);

    console.log(
      `   Found ${result.rows.length} products with opencart_id in database`
    );

    for (const row of result.rows) {
      if (row.opencart_id && row.variant_id) {
        const opencartIdNum = parseInt(row.opencart_id);
        if (!isNaN(opencartIdNum)) {
          mapping.set(opencartIdNum, row.variant_id);
          mappedCount++;
        }
      }
    }

    // If no products found with opencart_id, show what exists and provide guidance
    if (mappedCount === 0) {
      // Get all products and variants to show what exists
      const allProductsResult = await client.query(`
        SELECT 
          p.id as product_id,
          p.title,
          p.metadata,
          pv.id as variant_id,
          pv.sku,
          pv.ean,
          pv.upc
        FROM "product" p
        INNER JOIN "product_variant" pv ON p.id = pv.product_id
        ORDER BY p.created_at ASC
        LIMIT 10
      `);

      console.log(
        `   Found ${allProductsResult.rows.length} total products in database`
      );

      // Show sample of what exists
      if (allProductsResult.rows.length > 0) {
        console.log(`\n   ℹ️  Sample products in database (first 5):`);
        for (let i = 0; i < Math.min(5, allProductsResult.rows.length); i++) {
          const sample = allProductsResult.rows[i];
          const metadataStr = sample.metadata
            ? JSON.stringify(sample.metadata).substring(0, 100)
            : "null";
          console.log(`      - ${sample.title}`);
          console.log(
            `        SKU: ${sample.sku || "N/A"}, Variant ID: ${
              sample.variant_id
            }`
          );
          console.log(`        Metadata: ${metadataStr}...`);
        }
        console.log(
          `\n   ⚠️  Products exist but don't have 'opencart_id' in metadata.`
        );
        console.log(
          `   To migrate orders, products need to have opencart_id in their metadata.`
        );
        console.log(
          `\n   Quick Fix - Run this script to add opencart_id to existing products:`
        );
        console.log(
          `   npx medusa exec ./src/scripts/add-opencart-id-to-products.ts`
        );
        console.log(
          `\n   This will match products by SKU/model and add opencart_id automatically.\n`
        );
      } else {
        console.log(`\n   ⚠️  No products found in database at all.`);
        console.log(
          `   Please migrate products first before migrating orders.\n`
        );
      }
    }
  } catch (dbError: any) {
    console.log(`   ⚠️  Database query failed: ${dbError.message}`);
    console.log(`   Trying module service as fallback...`);

    // Fallback to module service
    try {
      const productModuleService = container.resolve(Modules.PRODUCT);
      const [allProducts] = await productModuleService.listAndCountProducts({});

      console.log(`   Found ${allProducts.length} products via module service`);

      for (const product of allProducts) {
        const metadata = (product as any).metadata || {};
        const opencartId = metadata.opencart_id || metadata.opencartId || null;

        if (!opencartId) {
          continue;
        }

        // Get variants
        let variants = (product as any).variants || [];
        if (!variants || variants.length === 0) {
          try {
            const productWithVariants =
              await productModuleService.retrieveProduct(product.id, {
                relations: ["variants"],
              });
            variants = (productWithVariants as any).variants || [];
          } catch (e) {
            continue;
          }
        }

        if (variants && variants.length > 0) {
          const opencartIdNum = parseInt(opencartId);
          if (!isNaN(opencartIdNum)) {
            mapping.set(opencartIdNum, variants[0].id);
            mappedCount++;
          }
        }
      }
    } catch (moduleError: any) {
      console.log(`   ⚠️  Module service also failed: ${moduleError.message}`);
    }
  }

  console.log(`✅ Mapped ${mappedCount} products to variants\n`);
  return mapping;
}

/**
 * Get or create customer using direct PostgreSQL client (safe, idempotent)
 * Only touches customer table (needed for orders)
 */
async function getOrCreateCustomer(
  client: Client,
  customerData: any
): Promise<string | null> {
  try {
    // Try to find existing customer by email
    const existingResult = await client.query(
      'SELECT id FROM "customer" WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
      [customerData.email]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      return existingResult.rows[0].id;
    }

    // Create new customer using direct DB insertion
    const customerId = generateId();

    await client.query(
      `INSERT INTO "customer" (id, email, first_name, last_name, phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        customerId,
        customerData.email,
        customerData.first_name || "Customer",
        customerData.last_name || "",
        customerData.phone || null,
      ]
    );

    return customerId;
  } catch (error: any) {
    console.error(
      `   ⚠️  Error creating customer ${customerData.email}:`,
      error.message
    );
    return null;
  }
}

/**
 * Create address in a specific table (for order_address or other address tables)
 * This is for when foreign key points to a table other than "customer_address"
 */
async function createAddressInTable(
  client: Client,
  addressData: any,
  tableName: string
): Promise<string | null> {
  try {
    const addressId = generateId();

    await client.query(
      `INSERT INTO "${tableName}" (
        id, first_name, last_name, company, address_1, address_2,
        city, postal_code, province, country_code, phone,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        addressId,
        addressData.first_name || "",
        addressData.last_name || "",
        addressData.company || null,
        addressData.address_1 || "",
        addressData.address_2 || null,
        addressData.city || "",
        addressData.postal_code || "",
        addressData.province || null,
        addressData.country_code || "in",
        addressData.phone || null,
      ]
    );

    return addressId;
  } catch (error: any) {
    console.error(
      `   ⚠️  Error creating address in ${tableName} table:`,
      error.message
    );
    return null;
  }
}

/**
 * Create address using direct PostgreSQL client (safe operation)
 * Orders reference customer_address table via foreign key
 * We need to create addresses in customer_address with customer_id
 */
async function createAddress(
  client: Client,
  addressData: any,
  customerId: string
): Promise<string | null> {
  try {
    const addressId = generateId();

    const result = await client.query(
      `INSERT INTO "customer_address" (
        id, customer_id, first_name, last_name, company, address_1, address_2,
        city, postal_code, province, country_code, phone,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id`,
      [
        addressId,
        customerId, // Required for customer_address table
        addressData.first_name || "",
        addressData.last_name || "",
        addressData.company || null,
        addressData.address_1 || "",
        addressData.address_2 || null,
        addressData.city || "",
        addressData.postal_code || "",
        addressData.province || null,
        addressData.country_code || "in",
        addressData.phone || null,
      ]
    );

    // Verify it was actually inserted
    if (result.rows.length === 0) {
      console.error(
        `   ⚠️  Address insert returned no rows for ID: ${addressId}`
      );
      return null;
    }

    const insertedId = result.rows[0].id;
    return insertedId;
  } catch (error: any) {
    console.error("   ⚠️  Error creating address:", error.message);
    console.error(
      "   ⚠️  Address data:",
      JSON.stringify(addressData).substring(0, 100)
    );
    return null;
  }
}

/**
 * Create order in Medusa using direct PostgreSQL client
 * This is safe and ONLY touches order-related tables (order, order_line_item)
 * Also creates customer/address if needed (safe operations)
 */
async function createOrder(
  container: any,
  orderData: any,
  productMapping: Map<number, string>,
  client: Client
) {
  const regionModuleService = container.resolve(Modules.REGION);

  try {
    // Get or create customer (safe operation)
    const customerId = await getOrCreateCustomer(client, orderData.customer);
    if (!customerId) {
      throw new Error("Failed to create/get customer");
    }

    // Create addresses (safe operation) - orders reference customer_address table
    let billingAddressId = await createAddress(
      client,
      orderData.billing_address,
      customerId
    );
    let shippingAddressId = await createAddress(
      client,
      orderData.shipping_address,
      customerId
    );

    if (!billingAddressId || !shippingAddressId) {
      throw new Error("Failed to create addresses");
    }

    // Verify addresses exist in database and are accessible
    const verifyBilling = await client.query(
      'SELECT id, customer_id FROM "customer_address" WHERE id = $1',
      [billingAddressId]
    );
    const verifyShipping = await client.query(
      'SELECT id, customer_id FROM "customer_address" WHERE id = $1',
      [shippingAddressId]
    );

    if (verifyBilling.rows.length === 0) {
      throw new Error(
        `Billing address ${billingAddressId} was not found after creation`
      );
    }
    if (verifyShipping.rows.length === 0) {
      throw new Error(
        `Shipping address ${shippingAddressId} was not found after creation`
      );
    }

    // Check what table the foreign key actually references
    const fkCheck = await client.query(`
      SELECT
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'order'
        AND kcu.column_name = 'shipping_address_id'
    `);

    if (fkCheck.rows.length > 0) {
      const fkTable = fkCheck.rows[0].foreign_table_name;
      const fkColumn = fkCheck.rows[0].foreign_column_name;
      console.log(`   🔍 Foreign key references: ${fkTable}.${fkColumn}`);

      // If foreign key points to a different table, we need to create addresses there
      if (fkTable !== "customer_address") {
        console.warn(
          `   ⚠️  Foreign key points to ${fkTable}, creating addresses there`
        );

        // Delete addresses from customer_address and create in correct table
        await client
          .query('DELETE FROM "customer_address" WHERE id = $1', [
            billingAddressId,
          ])
          .catch(() => {});
        await client
          .query('DELETE FROM "customer_address" WHERE id = $1', [
            shippingAddressId,
          ])
          .catch(() => {});

        // Create addresses in the table the foreign key references (e.g., order_address)
        const billingAddressIdNew = await createAddressInTable(
          client,
          orderData.billing_address,
          fkTable
        );
        const shippingAddressIdNew = await createAddressInTable(
          client,
          orderData.shipping_address,
          fkTable
        );

        if (!billingAddressIdNew || !shippingAddressIdNew) {
          throw new Error(`Failed to create addresses in ${fkTable}`);
        }

        billingAddressId = billingAddressIdNew;
        shippingAddressId = shippingAddressIdNew;

        // Re-verify
        const verifyBillingNew = await client.query(
          `SELECT id FROM "${fkTable}" WHERE id = $1`,
          [billingAddressId]
        );
        const verifyShippingNew = await client.query(
          `SELECT id FROM "${fkTable}" WHERE id = $1`,
          [shippingAddressId]
        );

        if (
          verifyBillingNew.rows.length === 0 ||
          verifyShippingNew.rows.length === 0
        ) {
          throw new Error(`Addresses not found in ${fkTable} after creation`);
        }

        console.log(`   ✅ Addresses created in ${fkTable}`);
      } else {
        // Foreign key points to customer_address - verify customer_id matches
        if (verifyBilling.rows[0].customer_id !== customerId) {
          throw new Error(`Billing address customer_id mismatch`);
        }
        if (verifyShipping.rows[0].customer_id !== customerId) {
          throw new Error(`Shipping address customer_id mismatch`);
        }
      }
    } else {
      // No foreign key found - verify customer_id matches anyway for customer_address
      if (verifyBilling.rows[0].customer_id !== customerId) {
        throw new Error(`Billing address customer_id mismatch`);
      }
      if (verifyShipping.rows[0].customer_id !== customerId) {
        throw new Error(`Shipping address customer_id mismatch`);
      }
    }

    // Map line items with variant_ids
    const lineItems: any[] = [];
    let skippedItems = 0;

    for (const item of orderData.items) {
      const variantId = productMapping.get(item.product_id);
      if (!variantId) {
        skippedItems++;
        console.warn(
          `   ⚠️  No variant mapping for product_id ${item.product_id}, skipping item`
        );
        continue;
      }

      // Store original unit_price before conversion for raw_unit_price calculation
      const originalUnitPrice = item.unit_price; // Original price in base currency (e.g., 19200.00)
      const unitPriceInCents = Math.round(item.unit_price * 100); // Convert to cents (e.g., 1920000)

      lineItems.push({
        variant_id: variantId,
        title: item.title,
        quantity: item.quantity,
        unit_price: unitPriceInCents, // Store in cents
        original_unit_price: originalUnitPrice, // Keep original for raw_unit_price calculation
        metadata: {
          opencart_product_id: item.product_id,
          model: item.model,
          options: item.options || [],
        },
      });
    }

    if (lineItems.length === 0) {
      throw new Error("No valid line items after mapping");
    }

    if (skippedItems > 0) {
      console.log(
        `   ⚠️  Skipped ${skippedItems} items without variant mapping`
      );
    }

    // Get region for currency
    const regions = await regionModuleService.listRegions({});
    const defaultRegion =
      regions.find((r: any) => r.currency_code === orderData.currency_code) ||
      regions[0];

    if (!defaultRegion) {
      throw new Error(
        `No region found for currency ${orderData.currency_code}`
      );
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

    // Build metadata including all order totals and statuses
    // Medusa v2 stores totals and statuses in metadata
    // Ensure payment_status and fulfillment_status are properly set
    const orderMetadata: any = {
      ...(orderData.metadata || {}),
      // Store payment and fulfillment status in metadata (Medusa Admin reads these)
      payment_status: orderData.payment_status || "awaiting",
      fulfillment_status: orderData.fulfillment_status || "not_fulfilled",
      opencart_order_id: orderData.display_id,
      // Store totals in metadata for reference
      totals: {
        subtotal: subtotal,
        shipping_total: shippingTotal,
        tax_total: taxTotal,
        discount_total: discountTotal,
        total: total,
      },
    };

    // Insert order directly using PostgreSQL client (ONLY order table)
    // Medusa v2 order table has minimal columns - totals are calculated from line items
    // Only include columns that actually exist: id, display_id, email, currency_code, region_id,
    // customer_id, billing_address_id, shipping_address_id, status, metadata, created_at, updated_at

    // Insert order - addresses are already verified and created in the correct table
    await client.query(
      `INSERT INTO "order" (
        id, display_id, email, currency_code, region_id, customer_id,
        billing_address_id, shipping_address_id, status, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
        JSON.stringify(orderMetadata),
        now,
        updatedAt,
      ]
    );

    // Get ALL columns from order_line_item to find the correct order reference column
    const lineItemCols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'order_line_item'
      ORDER BY ordinal_position
    `);

    const allCols = lineItemCols.rows.map((r: any) => r.column_name);
    console.log(`   🔍 order_line_item columns: ${allCols.join(", ")}`);

    // Check foreign keys to find which column references the order table
    const lineItemFkCheck = await client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'order_line_item'
        AND ccu.table_name = 'order'
    `);

    let orderRefColumn: string | undefined;
    if (lineItemFkCheck.rows.length > 0) {
      orderRefColumn = lineItemFkCheck.rows[0].column_name;
      console.log(
        `   🔍 Found order reference column via FK: ${orderRefColumn}`
      );
    } else {
      // Fallback: find column that contains 'order'
      orderRefColumn = allCols.find((col: string) => {
        const lower = col.toLowerCase();
        return (
          (lower.includes("order") || lower === "order") &&
          !lower.includes("line") &&
          !lower.includes("item")
        );
      });
    }

    // In Medusa v2, line items are linked through totals_id, not order_id
    // Check if totals_id exists and create order totals entry first
    if (!orderRefColumn && allCols.includes("totals_id")) {
      console.log(
        `   🔍 No direct order link found, using totals_id relationship...`
      );

      // Check what totals_id links to
      const totalsFkCheck = await client.query(`
        SELECT
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'order_line_item'
          AND kcu.column_name = 'totals_id'
      `);

      if (totalsFkCheck.rows.length > 0) {
        const totalsTable = totalsFkCheck.rows[0].foreign_table_name;
        console.log(`   🔍 totals_id links to ${totalsTable}`);

        // Check if that totals table links to order
        const totalsToOrder = await client.query(
          `
          SELECT kcu.column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
            AND ccu.table_name = 'order'
        `,
          [totalsTable]
        );

        if (totalsToOrder.rows.length > 0) {
          // Create order totals entry first
          const totalsId = generateId();
          const totalsOrderCol = totalsToOrder.rows[0].column_name;

          // Get columns of totals table to insert correctly
          const totalsCols = await client.query(
            `
            SELECT column_name, is_nullable, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
            ORDER BY ordinal_position
          `,
            [totalsTable]
          );

          const totalsColNames = totalsCols.rows.map((r: any) => r.column_name);
          const hasVersion = totalsColNames.includes("version");
          const hasItemId = totalsColNames.includes("item_id");
          console.log(
            `   🔍 ${totalsTable} columns: ${totalsColNames.join(", ")}`
          );

          // Check if totals_id is nullable in order_line_item
          const lineItemTotalsIdCheck = await client.query(`
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'order_line_item'
              AND column_name = 'totals_id'
          `);

          const totalsIdNullable =
            lineItemTotalsIdCheck.rows.length > 0 &&
            lineItemTotalsIdCheck.rows[0].is_nullable === "YES";

          let firstLineItemId: string | null = null;
          const lineItemIds: string[] = [];

          // Strategy: Handle circular dependency between order_item and order_line_item
          // If totals_id is nullable: Create line items first, then order_item, then update line items
          // If totals_id is NOT NULL: Create order_item with temporary item_id, create line items, update order_item

          if (totalsIdNullable && hasItemId) {
            // Strategy 1: totals_id is nullable - create line items first
            console.log(
              `   🔍 totals_id is nullable, creating line items first...`
            );

            for (const item of lineItems) {
              const lineItemId = generateId();
              lineItemIds.push(lineItemId);
              if (!firstLineItemId) {
                firstLineItemId = lineItemId;
              }

              // Insert with NULL totals_id initially
              // Note: quantity is NOT stored in order_line_item, it's in order_item
              // raw_unit_price is in thousandths: original_price * 1000 (e.g., 19200.00 * 1000 = 19200000)
              // unit_price is in cents: original_price * 100 (e.g., 19200.00 * 100 = 1920000)
              const originalPrice =
                item.original_unit_price || item.unit_price / 100;
              const rawUnitPrice = Math.round(originalPrice * 1000); // Convert to thousandths
              await client.query(
                `INSERT INTO "order_line_item" (
                  id, totals_id, variant_id, title, unit_price, raw_unit_price, metadata, created_at, updated_at
                ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  lineItemId,
                  item.variant_id,
                  item.title,
                  item.unit_price, // Already in cents
                  rawUnitPrice, // In thousandths
                  JSON.stringify(item.metadata || {}),
                  now,
                  now,
                ]
              );
            }

            console.log(
              `   ✅ Created ${lineItemIds.length} line items (totals_id=NULL)`
            );

            // Calculate total quantity from all line items
            const totalQuantity = lineItems.reduce(
              (sum, item) => sum + item.quantity,
              0
            );
            const totalRawQuantity = totalQuantity * 1000; // raw_quantity is typically in thousandths

            // Now create order_item with item_id pointing to first line item
            let insertCols = ["id", `"${totalsOrderCol}"`];
            let insertPlaceholders: string[] = ["$1", "$2"];
            let insertValues: any[] = [totalsId, orderId];
            let paramIndex = 3;

            // Add version column if it exists
            if (hasVersion) {
              insertCols.push("version");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(1);
              paramIndex++;
              console.log(`   🔍 Adding version=1 to ${totalsTable}`);
            }

            // Add item_id (required, points to first line item)
            if (hasItemId && firstLineItemId) {
              insertCols.push("item_id");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(firstLineItemId);
              paramIndex++;
              console.log(
                `   🔍 Adding item_id=${firstLineItemId} to ${totalsTable}`
              );
            }

            // Add quantity columns if they exist in order_item
            const hasQuantity = totalsColNames.includes("quantity");
            const hasRawQuantity = totalsColNames.includes("raw_quantity");
            const hasFulfilledQuantity =
              totalsColNames.includes("fulfilled_quantity");
            const hasRawFulfilledQuantity = totalsColNames.includes(
              "raw_fulfilled_quantity"
            );

            if (hasQuantity) {
              insertCols.push("quantity");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(totalQuantity);
              paramIndex++;
              console.log(
                `   🔍 Adding quantity=${totalQuantity} to ${totalsTable}`
              );
            }

            if (hasRawQuantity) {
              insertCols.push("raw_quantity");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(totalRawQuantity);
              paramIndex++;
              console.log(
                `   🔍 Adding raw_quantity=${totalRawQuantity} to ${totalsTable}`
              );
            }

            // Add all required quantity fields (all NOT NULL) - set to 0 for new orders
            const quantityFields = [
              "fulfilled_quantity",
              "raw_fulfilled_quantity",
              "shipped_quantity",
              "raw_shipped_quantity",
              "return_requested_quantity",
              "raw_return_requested_quantity",
              "return_received_quantity",
              "raw_return_received_quantity",
              "return_dismissed_quantity",
              "raw_return_dismissed_quantity",
              "written_off_quantity",
              "raw_written_off_quantity",
              "delivered_quantity",
              "raw_delivered_quantity",
            ];

            for (const field of quantityFields) {
              if (totalsColNames.includes(field)) {
                insertCols.push(field);
                insertPlaceholders.push(`$${paramIndex}`);
                insertValues.push(0); // Default to 0 for new orders
                paramIndex++;
              }
            }

            // Add timestamps
            insertCols.push("created_at", "updated_at");
            insertPlaceholders.push("NOW()", "NOW()");

            // Create order_item entry
            await client.query(
              `INSERT INTO "${totalsTable}" (${insertCols.join(", ")})
               VALUES (${insertPlaceholders.join(", ")})`,
              insertValues
            );

            console.log(`   ✅ Created ${totalsTable} entry: ${totalsId}`);

            // Update all line items to set totals_id
            // Use IN clause with explicit UUID casting to avoid type mismatch
            const lineItemIdsPlaceholders = lineItemIds
              .map((_, i) => `$${i + 2}`)
              .join(", ");
            await client.query(
              `UPDATE "order_line_item" 
               SET totals_id = $1::uuid 
               WHERE id IN (${lineItemIdsPlaceholders})`,
              [totalsId, ...lineItemIds]
            );
            console.log(
              `   ✅ Updated ${lineItemIds.length} line items with totals_id`
            );
          } else {
            // Strategy 2: totals_id is NOT NULL - need to create order_item first with temporary item_id
            // But we can't create a valid item_id without line items, so we need a workaround
            // Create a temporary line item first, use it for item_id, then create real line items

            console.log(`   🔍 totals_id is NOT NULL, using workaround...`);

            // Create a temporary line item first (will be deleted/replaced)
            const tempLineItemId = generateId();
            firstLineItemId = tempLineItemId;

            // Create temporary order_item with item_id pointing to temp line item
            let insertCols = ["id", `"${totalsOrderCol}"`];
            let insertPlaceholders: string[] = ["$1", "$2"];
            let insertValues: any[] = [totalsId, orderId];
            let paramIndex = 3;

            if (hasVersion) {
              insertCols.push("version");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(1);
              paramIndex++;
            }

            if (hasItemId) {
              insertCols.push("item_id");
              insertPlaceholders.push(`$${paramIndex}`);
              insertValues.push(tempLineItemId);
              paramIndex++;
            }

            // Add all required quantity fields (all NOT NULL) - set to 0 for new orders
            const quantityFields = [
              "fulfilled_quantity",
              "raw_fulfilled_quantity",
              "shipped_quantity",
              "raw_shipped_quantity",
              "return_requested_quantity",
              "raw_return_requested_quantity",
              "return_received_quantity",
              "raw_return_received_quantity",
              "return_dismissed_quantity",
              "raw_return_dismissed_quantity",
              "written_off_quantity",
              "raw_written_off_quantity",
              "delivered_quantity",
              "raw_delivered_quantity",
            ];

            for (const field of quantityFields) {
              if (totalsColNames.includes(field)) {
                insertCols.push(field);
                insertPlaceholders.push(`$${paramIndex}`);
                insertValues.push(0); // Default to 0 for new orders
                paramIndex++;
              }
            }

            insertCols.push("created_at", "updated_at");
            insertPlaceholders.push("NOW()", "NOW()");

            // Create order_item first
            await client.query(
              `INSERT INTO "${totalsTable}" (${insertCols.join(", ")})
               VALUES (${insertPlaceholders.join(", ")})`,
              insertValues
            );

            console.log(`   ✅ Created ${totalsTable} entry: ${totalsId}`);

            // Calculate total quantity from all line items
            const totalQuantity = lineItems.reduce(
              (sum, item) => sum + item.quantity,
              0
            );
            const totalRawQuantity = totalQuantity * 1000; // raw_quantity is typically in thousandths

            // Now create real line items with totals_id
            // Note: quantity is NOT stored in order_line_item, it's in order_item
            // raw_unit_price is in thousandths: original_price * 1000
            // unit_price is already in cents, so we need to get original price
            for (const item of lineItems) {
              const lineItemId = generateId();
              lineItemIds.push(lineItemId);
              const originalPrice =
                item.original_unit_price || item.unit_price / 100;
              const rawUnitPrice = Math.round(originalPrice * 1000);

              await client.query(
                `INSERT INTO "order_line_item" (
                  id, totals_id, variant_id, title, unit_price, raw_unit_price, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  lineItemId,
                  totalsId,
                  item.variant_id,
                  item.title,
                  item.unit_price,
                  rawUnitPrice,
                  JSON.stringify(item.metadata || {}),
                  now,
                  now,
                ]
              );
            }

            // Update order_item.item_id to point to first real line item (if we have any)
            if (hasItemId && lineItemIds.length > 0) {
              await client.query(
                `UPDATE "${totalsTable}" 
                 SET item_id = $1 
                 WHERE id = $2`,
                [lineItemIds[0], totalsId]
              );
              console.log(
                `   ✅ Updated ${totalsTable}.item_id to point to first line item`
              );

              // Delete temporary line item if it exists and wasn't used
              if (tempLineItemId !== lineItemIds[0]) {
                await client.query(
                  `DELETE FROM "order_line_item" WHERE id = $1`,
                  [tempLineItemId]
                );
              }
            }

            // Update order_item with quantity if columns exist
            const hasQuantity = totalsColNames.includes("quantity");
            const hasRawQuantity = totalsColNames.includes("raw_quantity");

            if (hasQuantity || hasRawQuantity) {
              const updateCols: string[] = [];
              const updateValues: any[] = [];
              let updateParamIndex = 1;

              if (hasQuantity) {
                updateCols.push(`quantity = $${updateParamIndex}`);
                updateValues.push(totalQuantity);
                updateParamIndex++;
              }

              if (hasRawQuantity) {
                updateCols.push(`raw_quantity = $${updateParamIndex}`);
                updateValues.push(totalRawQuantity);
                updateParamIndex++;
              }

              updateValues.push(totalsId);

              await client.query(
                `UPDATE "${totalsTable}" 
                 SET ${updateCols.join(", ")} 
                 WHERE id = $${updateParamIndex}`,
                updateValues
              );
              console.log(
                `   ✅ Updated ${totalsTable} with quantity=${totalQuantity}`
              );
            }

            console.log(`   ✅ Created ${lineItemIds.length} line items`);
          }

          return {
            id: orderId,
            display_id: orderData.display_id,
            email: orderData.email,
          };
        }
      }
    }

    if (!orderRefColumn) {
      throw new Error(
        `Could not find order reference column. Available: ${allCols.join(
          ", "
        )}`
      );
    }

    console.log(`   ✅ Using order reference column: ${orderRefColumn}`);

    // Insert line items (ONLY order_line_item table)
    // Note: quantity is NOT stored in order_line_item, it's stored in order_item
    // raw_unit_price is in thousandths: original_price * 1000
    // unit_price is already in cents, so we need to get original price
    for (const item of lineItems) {
      const lineItemId = generateId();
      const originalPrice = item.original_unit_price || item.unit_price / 100;
      const rawUnitPrice = Math.round(originalPrice * 1000);
      await client.query(
        `INSERT INTO "order_line_item" (
          id, "${orderRefColumn}", variant_id, title, unit_price, raw_unit_price, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          lineItemId,
          orderId,
          item.variant_id,
          item.title,
          item.unit_price,
          rawUnitPrice,
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
  } catch (error: any) {
    console.error(
      `   ❌ Error creating order ${orderData.display_id}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Main load function (called by medusa exec)
 * This is the default export that medusa exec expects
 */
export default async function loadOpencartOrders({ container }: any) {
  console.log("🚀 Order ETL Load Script Started\n");

  if (!container) {
    throw new Error("Container not provided");
  }

  // Path to JSON file (relative to project root)
  // When running from my-medusa-store, go up one level to reach etl/
  const ordersFile = path.join(
    process.cwd(),
    "..",
    "etl",
    "orders",
    "exports",
    `medusa-orders-${ORDER_LIMIT}.json`
  );

  console.log(`📂 Looking for orders file at: ${ordersFile}`);

  if (!fs.existsSync(ordersFile)) {
    throw new Error(
      `❌ Orders file not found: ${ordersFile}\n` +
        `   Run extract.js first: cd etl/orders && node extract.js`
    );
  }

  console.log(`📖 Reading orders from ${ordersFile}...`);
  const ordersData = JSON.parse(fs.readFileSync(ordersFile, "utf-8"));
  console.log(`✅ Loaded ${ordersData.length} orders\n`);

  // Get database connection first (needed for product mapping fallback)
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();
  console.log("✅ Connected to database\n");

  // Build product mapping (uses both module service and direct DB query)
  const productMapping = await buildProductMapping(container, client);

  if (productMapping.size === 0) {
    console.warn(
      "⚠️  Warning: No product mappings found. Orders may fail to create."
    );
    console.warn("   Make sure products are migrated first.\n");
  }

  let migrated = 0;
  let failed = 0;
  const errors: Array<{ order_id: number; error: string }> = [];

  try {
    console.log(`🚀 Starting order migration...\n`);

    for (let i = 0; i < ordersData.length; i++) {
      const orderData = ordersData[i];

      try {
        console.log(
          `[${i + 1}/${ordersData.length}] Migrating order #${
            orderData.display_id
          }...`
        );

        const order = await createOrder(
          container,
          orderData,
          productMapping,
          client
        );

        migrated++;
        console.log(
          `   ✅ Success: Order #${orderData.display_id} (ID: ${
            order?.id || "N/A"
          })\n`
        );
      } catch (error: any) {
        failed++;
        const errorMsg = `   ❌ Failed: ${error.message}`;
        console.error(errorMsg);
        errors.push({
          order_id: orderData.display_id,
          error: error.message,
        });
        console.log(""); // Empty line
      }

      // Progress update every 10 orders
      if ((i + 1) % 10 === 0) {
        console.log(`📊 Progress: ${migrated} migrated, ${failed} failed\n`);
      }
    }
  } finally {
    await client.end();
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
  } else {
    console.log(`\n⚠️  No orders were migrated.`);
    if (productMapping.size === 0) {
      console.log(`\n📋 Next Steps:`);
      console.log(`   Products exist but don't have opencart_id in metadata.`);
      console.log(
        `\n   Option 1 - Add opencart_id to existing products (RECOMMENDED):`
      );
      console.log(
        `      npx medusa exec ./src/scripts/add-opencart-id-to-products.ts`
      );
      console.log(
        `      This will match products by SKU/model and add opencart_id automatically.`
      );
      console.log(
        `\n   Option 2 - Re-migrate products (if you want to start fresh):`
      );
      console.log(
        `      npx medusa exec ./scripts/migrate-opencart-to-medusa.js`
      );
      console.log(`\n   Then run this script again to migrate orders.`);
    }
  }
}
