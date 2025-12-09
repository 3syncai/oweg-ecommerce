import { Pool } from 'pg';

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
