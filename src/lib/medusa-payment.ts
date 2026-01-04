// FORCE REBUILD 2
import { Pool } from 'pg';

import crypto from "crypto";

/**
 * Create complete payment record chain in Medusa's payment tables
 * Creates: payment_collection → payment_session → payment
 * Links: order_payment_collection
 * Updates: captured_amount on payment_collection
 * 
 * NOTE: payment.amount should be in PAISE (minor units)
 * This function converts to RUPEES (major units) for Medusa storage
 */
export async function createMedusaPayment(payment: {
    order_id: string;
    amount: number;  // Amount in PAISE (e.g., 31160 for ₹311.60)
    currency_code: string;
    provider_id: string;
    data: Record<string, unknown>;
}) {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set!');
        return { success: false, error: 'DATABASE_URL not configured' };
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Convert paise to rupees for Medusa storage (Medusa uses major units)
    const amountRupees = payment.amount / 100;

    try {
        // 1. Get cart_id from order
        const orderQuery = 'SELECT metadata->>\'cart_id\' as cart_id FROM "order" WHERE id = $1';
        const orderRes = await pool.query(orderQuery, [payment.order_id]);
        const cartId = orderRes.rows[0]?.cart_id;

        let paymentCollectionId: string | null = null;
        let paymentSessionId: string | null = null;

        // 2. NOTE: We always create a NEW payment_collection for each payment
        // to avoid linking old payments to new orders
        // (Previously we were reusing by cart_id which caused cross-order payment issues)

        const rawAmount = JSON.stringify({ amount: amountRupees });

        // 3. Create payment_collection if not found
        if (!paymentCollectionId) {
            console.log('⚠️ No payment_collection found. Creating new one for cart:', cartId);
            const createPcQuery = `
                INSERT INTO payment_collection (
                    id, currency_code, amount, raw_amount, 
                    captured_amount, raw_captured_amount,
                    status, created_at, updated_at, metadata
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, 'completed', now(), now(), $6
                )
                RETURNING id;
            `;
            const pcMetadata = cartId ? JSON.stringify({ cart_id: cartId }) : '{}';
            const newPc = await pool.query(createPcQuery, [
                payment.currency_code.toLowerCase(),
                amountRupees,
                rawAmount,
                amountRupees,  // captured_amount
                rawAmount,       // raw_captured_amount
                pcMetadata
            ]);
            paymentCollectionId = newPc.rows[0].id;
            console.log('✅ Created new payment_collection:', paymentCollectionId);
        } else {
            // Update existing payment_collection with captured_amount
            console.log('📝 Updating payment_collection with captured_amount...');
            await pool.query(`
                UPDATE payment_collection 
                SET captured_amount = $1, 
                    raw_captured_amount = $2,
                    status = 'completed',
                    updated_at = now()
                WHERE id = $3
            `, [amountRupees, rawAmount, paymentCollectionId]);
            console.log('✅ Updated payment_collection with captured_amount');
        }

        // 4. Link order to payment_collection via order_payment_collection table
        console.log('🔗 Linking order to payment_collection...');
        await pool.query(`
            INSERT INTO order_payment_collection (id, order_id, payment_collection_id, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, now(), now())
            ON CONFLICT DO NOTHING
        `, [payment.order_id, paymentCollectionId]);
        console.log('✅ Linked order to payment_collection');

        // 5. Create payment_session
        console.log('💳 Creating payment_session...');
        const createSessionQuery = `
            INSERT INTO payment_session (
                id, currency_code, amount, raw_amount, provider_id, 
                data, context, status, payment_collection_id,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'captured', $7, now(), now()
            )
            RETURNING id;
        `;
        const sessionData = JSON.stringify(payment.data);
        const sessionContext = JSON.stringify({ cart_id: cartId });

        const sessionRes = await pool.query(createSessionQuery, [
            payment.currency_code.toLowerCase(),
            amountRupees,
            rawAmount,
            payment.provider_id,
            sessionData,
            sessionContext,
            paymentCollectionId
        ]);
        paymentSessionId = sessionRes.rows[0].id;
        console.log('✅ Created payment_session:', paymentSessionId);

        // 6. Insert into payment table
        console.log('💳 Creating payment record...');
        const query = `
            INSERT INTO payment (
                id, amount, raw_amount, currency_code, provider_id, data,
                payment_collection_id, payment_session_id, 
                captured_at, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now(), now()
            )
            RETURNING *;
        `;

        const values = [
            amountRupees,
            rawAmount,
            payment.currency_code.toUpperCase(),
            payment.provider_id,
            JSON.stringify(payment.data),
            paymentCollectionId,
            paymentSessionId
        ];

        const result = await pool.query(query, values);
        await pool.end();

        console.log('✅ Payment created in Medusa payment table:', result.rows[0].id);
        console.log('🎉 Payment integration complete!');
        return { success: true, data: result.rows[0] };
    } catch (err) {
        await pool.end();
        console.error('❌ Failed to create payment:', err);
        return { success: false, error: String(err) };
    }
}

/**
 * Create an OrderTransaction record in Medusa's order_transaction table.
 * This is CRITICAL for updating order_summary.paid_total correctly.
 * 
 * Without this record, Medusa Admin will show:
 * - paid_total = 0
 * - A misleading "Refund" bar
 * 
 * NOTE: Amount should be in MAJOR UNITS (Rupees) to match Medusa v2 conventions.
 * If you receive amount from Razorpay (Paise), divide by 100 first!
 * 
 * Schema: id, order_id, version, amount, raw_amount, currency_code, 
 *         reference, reference_id, created_at, updated_at
 */
export async function createOrderTransaction(transaction: {
    order_id: string;
    amount: number;  // Amount in RUPEES (major units)
    currency_code: string;
    reference?: string;      // e.g., payment_id or razorpay_payment_id
    reference_id?: string;   // e.g., razorpay_order_id
}) {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set!');
        return { success: false, error: 'DATABASE_URL not configured' };
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('💳 Creating OrderTransaction for order:', transaction.order_id);
        console.log('   Amount:', transaction.amount, transaction.currency_code.toUpperCase());

        // Build raw_amount JSON for Medusa v2
        const rawAmount = JSON.stringify({
            value: String(transaction.amount),
            precision: 20
        });

        // order_transaction schema: id, order_id, version, amount, raw_amount, 
        //                          currency_code, reference, reference_id, 
        //                          created_at, updated_at
        // NOTE: No metadata column, version is required
        const query = `
            INSERT INTO order_transaction (
                id, order_id, version, amount, raw_amount, currency_code,
                reference, reference_id,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, 1, $2, $3, $4, $5, $6, now(), now()
            )
            RETURNING id, order_id, amount;
        `;

        const values = [
            transaction.order_id,
            transaction.amount,
            rawAmount,
            transaction.currency_code.toLowerCase(),
            transaction.reference || null,
            transaction.reference_id || null,
        ];

        const result = await pool.query(query, values);

        console.log('✅ OrderTransaction created:', result.rows[0].id);
        console.log('   This will update paid_total in order_summary!');

        await pool.end();
        return { success: true, data: result.rows[0] };
    } catch (err) {
        await pool.end();
        console.error('❌ Failed to create OrderTransaction:', err);
        return { success: false, error: String(err) };
    }
}

/**
 * Update order_summary.totals to reflect the actual order_transaction records.
 * This ensures Medusa Admin shows correct paid_total and avoids "Refund" display issues.
 * 
 * Call this after creating an OrderTransaction to ensure the summary is in sync.
 * 
 * @param orderId - The Medusa order ID
 * @returns Success/failure result
 */
export async function updateOrderSummaryTotals(orderId: string) {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set!');
        return { success: false, error: 'DATABASE_URL not configured' };
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('📊 Updating order_summary totals for order:', orderId);

        // 1. Get current order summary
        const summaryRes = await pool.query(`
            SELECT id, totals, order_id FROM order_summary WHERE order_id = $1
        `, [orderId]);

        if (summaryRes.rows.length === 0) {
            console.log('  ⚠️ No order_summary found for order');
            await pool.end();
            return { success: false, error: 'Order summary not found' };
        }

        const summary = summaryRes.rows[0];
        const currentTotals = summary.totals || {};

        // 2. Calculate transaction total from order_transaction records
        const txSumRes = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as transaction_total,
                COUNT(*) as tx_count
            FROM order_transaction 
            WHERE order_id = $1 AND deleted_at IS NULL
        `, [orderId]);

        const transactionTotal = Number(txSumRes.rows[0].transaction_total);
        const txCount = Number(txSumRes.rows[0].tx_count);
        console.log(`  Transaction total from ${txCount} records: ${transactionTotal}`);

        // 3. Get order total for calculating pending_difference
        const orderTotal = Number(currentTotals.current_order_total || currentTotals.original_order_total || 0);
        const pendingDifference = Math.max(0, orderTotal - transactionTotal);

        // 4. Build updated totals
        const updatedTotals = {
            ...currentTotals,
            paid_total: transactionTotal,
            raw_paid_total: { value: String(transactionTotal), precision: 20 },
            transaction_total: transactionTotal,
            raw_transaction_total: { value: String(transactionTotal), precision: 20 },
            pending_difference: pendingDifference,
            raw_pending_difference: { value: String(pendingDifference), precision: 20 },
        };

        // 5. Update order_summary
        await pool.query(`
            UPDATE order_summary 
            SET totals = $1, updated_at = now()
            WHERE order_id = $2
        `, [JSON.stringify(updatedTotals), orderId]);

        console.log('✅ Order summary updated:');
        console.log(`   paid_total: ${transactionTotal}`);
        console.log(`   pending_difference: ${pendingDifference}`);

        await pool.end();
        return { success: true, data: { paid_total: transactionTotal, pending_difference: pendingDifference } };
    } catch (err) {
        await pool.end();
        console.error('❌ Failed to update order_summary:', err);
        return { success: false, error: String(err) };
    }
}

/**
 * Ensures an order has a shipping method attached.
 * If missing, it finds a "Standard" shipping option and attaches it.
 */
export async function ensureOrderShippingMethod(orderId: string) {
    if (!process.env.DATABASE_URL) return { success: false, error: 'No DB URL' };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log(`🚚 Checking shipping method for order: ${orderId}`);

        // 1. Check if method exists
        const checkRes = await pool.query(`
            SELECT id FROM order_shipping WHERE order_id = $1
        `, [orderId]);

        if (checkRes.rowCount && checkRes.rowCount > 0) {
            console.log('✅ Order already has a shipping method.');
            await pool.end();
            return { success: true };
        }

        console.log('⚠️ No shipping method found. Attaching standard shipping...');

        // 2. Find a "Standard" option (or fallback to any valid option)
        const optionRes = await pool.query(`
            SELECT id, name, amount, price_type
            FROM shipping_option
            WHERE name ILIKE '%Standard%' OR name ILIKE '%Default%'
            LIMIT 1
        `);

        if (optionRes.rowCount === 0) {
            console.error('❌ No valid shipping option found in database.');
            await pool.end();
            return { success: false, error: 'No shipping option available' };
        }

        const option = optionRes.rows[0];
        const methodId = `osm_${crypto.randomUUID()}`;
        const amount = 0; // Free for now, or use option.amount if needed
        const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });

        // 3. Insert specific method
        await pool.query(`
            INSERT INTO order_shipping_method (
                id, name, amount, raw_amount, is_tax_inclusive,
                shipping_option_id, created_at, updated_at, is_custom_amount
            ) VALUES (
                $1, $2, $3, $4, false,
                $5, now(), now(), false
            )
        `, [methodId, option.name, amount, rawAmount, option.id]);

        // 4. Link to Order
        await pool.query(`
            INSERT INTO order_shipping (
                id, order_id, version, shipping_method_id, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, 1, $2, now(), now()
            )
        `, [orderId, methodId]);

        console.log(`✅ Attached "${option.name}" to order.`);
        await pool.end();
        return { success: true };

    } catch (err) {
        console.error('❌ Failed to ensure shipping method:', err);
        await pool.end();
        return { success: false, error: String(err) };
    }
}

/**
 * Ensures all items in an order have stock reservations.
 * If missing, creates them against the default stock location.
 */
export async function ensureOrderReservations(orderId: string) {
    if (!process.env.DATABASE_URL) return { success: false, error: 'No DB URL' };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log(`📦 Checking reservations for order: ${orderId}`);

        // 1. Get default stock location
        const locRes = await pool.query(`SELECT id FROM stock_location LIMIT 1`);
        if (locRes.rowCount === 0) {
            console.error('❌ No stock location found.');
            await pool.end();
            return { success: false, error: 'No stock location' };
        }
        const locationId = locRes.rows[0].id;

        // 2. Get unreserved items
        // Join to find items that lack a corresponding reservation_item
        // NOTE: quantity is on order_item (oi), variant_id is on order_line_item (oli)
        const itemsRes = await pool.query(`
            SELECT oli.id as line_item_id, oli.variant_id, oi.quantity, oli.title
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            WHERE oi.order_id = $1
            AND NOT EXISTS (
                SELECT 1 FROM reservation_item ri WHERE ri.line_item_id = oli.id
            )
        `, [orderId]);

        if (itemsRes.rowCount === 0) {
            console.log('✅ All items already have reservations.');
            await pool.end();
            return { success: true };
        }

        console.log(`⚠️ Found ${itemsRes.rowCount} items without reservations. Creating them...`);

        for (const item of itemsRes.rows) {
            if (!item.variant_id) continue;

            // Find Inventory Item ID
            const invRes = await pool.query(`
                SELECT inventory_item_id
                FROM product_variant_inventory_item
                WHERE variant_id = $1
            `, [item.variant_id]);

            if (invRes.rowCount === 0) {
                console.warn(`Skipping reservation for "${item.title}": No inventory item linked.`);
                continue;
            }

            const inventoryItemId = invRes.rows[0].inventory_item_id;
            const reservationId = `resitem_${crypto.randomUUID()}`;
            const rawQuantity = JSON.stringify({ value: String(item.quantity), precision: 20 });

            // Create Reservation
            await pool.query(`
                INSERT INTO reservation_item (
                    id, line_item_id, location_id, quantity, raw_quantity,
                    inventory_item_id, allow_backorder, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, true, now(), now()
                )
            `, [reservationId, item.line_item_id, locationId, item.quantity, rawQuantity, inventoryItemId]);

            console.log(`   + Reserved ${item.quantity} of "${item.title}"`);
        }

        console.log('✅ Reservations created.');
        await pool.end();
        return { success: true };

    } catch (err) {
        console.error('❌ Failed to ensure reservations:', err);
        await pool.end();
        return { success: false, error: String(err) };
    }
}