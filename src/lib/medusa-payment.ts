// FORCE REBUILD 2
import { Pool, type PoolClient } from 'pg';

import crypto from "crypto";
import { recordCaptureAtomically } from "@/lib/payment-capture-transaction";
import { enqueuePaymentWork } from "@/lib/payment-reliability";

function createPaymentPool(): Pool {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL not configured");
    }
    return new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("amazonaws.com")
            ? { rejectUnauthorized: false }
            : undefined,
    });
}

let sharedCapturePool: Pool | null = null;
function capturePool(): Pool {
    sharedCapturePool ??= createPaymentPool();
    return sharedCapturePool;
}

async function withOrderRepairLock(orderId:string, task:(client:PoolClient)=>Promise<{success:boolean;error?:string}>) {
 const pool=createPaymentPool(),client=await pool.connect();
 try {await client.query("BEGIN");await client.query("SET LOCAL lock_timeout='10s'");
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["order-payment:"+orderId]);
   const order=(await client.query('SELECT id,status FROM "order" WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!order)throw new Error('order_missing');
   if(['canceled','cancelled'].includes(order.status)){await client.query('COMMIT');return {success:true};}
   const result=await task(client);await client.query(result.success?"COMMIT":"ROLLBACK");return result;
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return {success:false,error:error instanceof Error?error.message:"order_repair_failed"};}
 finally{client.release();await pool.end();}
}

/**
 * Ensures an order has a shipping method attached.
 * If missing, it finds a "Standard" shipping option and attaches it.
 */
export async function ensureOrderShippingMethod(orderId: string) {
    if (!process.env.DATABASE_URL) return { success: false, error: 'No DB URL' };
    return withOrderRepairLock(orderId, async pool => {
        console.log(`🚚 Checking shipping method for order: ${orderId}`);

        // 1. Check if method exists
        const checkRes = await pool.query(`
            SELECT id FROM order_shipping WHERE order_id = $1
        `, [orderId]);

        if (checkRes.rowCount && checkRes.rowCount > 0) {
            console.log('✅ Order already has a shipping method.');
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
        return { success: true };

    });
}

/**
 * Ensures all items in an order have stock reservations.
 * If missing, creates them against the default stock location.
 */
export async function ensureOrderReservations(orderId: string) {
    if (!process.env.DATABASE_URL) return { success: false, error: 'No DB URL' };
    return withOrderRepairLock(orderId, async pool => {
        console.log(`📦 Checking reservations for order: ${orderId}`);

        // 1. Get default stock location
        const locRes = await pool.query(`SELECT id FROM stock_location LIMIT 1`);
        if (locRes.rowCount === 0) {
            console.error('❌ No stock location found.');
            return { success: false, error: 'No stock location' };
        }
        const locationId = locRes.rows[0].id;

        // 2. Get unreserved items
        // Join to find items that lack a corresponding reservation_item
        // NOTE: quantity is on order_item (oi), variant_id is on order_line_item (oli)
        const itemsRes = await pool.query(`
            SELECT oli.id as line_item_id, oli.variant_id,
              GREATEST(0,oi.quantity-oi.fulfilled_quantity) AS quantity, oli.title,pv.manage_inventory,pv.allow_backorder
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            JOIN product_variant pv ON pv.id=oli.variant_id
            WHERE oi.order_id = $1
            AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
            AND oi.version=(SELECT version FROM "order" WHERE id=$1)
            AND oi.quantity>oi.fulfilled_quantity
            AND NOT EXISTS (
                SELECT 1 FROM reservation_item ri WHERE ri.line_item_id = oli.id AND ri.deleted_at IS NULL
            )
        `, [orderId]);

        if (itemsRes.rowCount === 0) {
            console.log('✅ All items already have reservations.');
            return { success: true };
        }

        console.log(`⚠️ Found ${itemsRes.rowCount} items without reservations. Creating them...`);

        for (const item of itemsRes.rows) {
            if (!item.variant_id || item.manage_inventory===false) continue;

            // Find Inventory Item ID
            const invRes = await pool.query(`
                SELECT inventory_item_id,required_quantity
                FROM product_variant_inventory_item
                WHERE variant_id = $1 AND deleted_at IS NULL ORDER BY inventory_item_id
            `, [item.variant_id]);

            if (invRes.rowCount === 0) {
                throw new Error('managed_variant_inventory_link_missing');
            }

            for(const inventory of invRes.rows) {
            const inventoryItemId = inventory.inventory_item_id;
            const quantity=Number(item.quantity)*Number(inventory.required_quantity||1);
            const level=(await pool.query("SELECT id,stocked_quantity,reserved_quantity FROM inventory_level WHERE inventory_item_id=$1 AND location_id=$2 AND deleted_at IS NULL FOR UPDATE",[inventoryItemId,locationId])).rows[0];
            if(!level)throw new Error('inventory_level_missing');
            if(!item.allow_backorder && Number(level.stocked_quantity)-Number(level.reserved_quantity)<quantity)throw new Error('insufficient_inventory_for_paid_order');
            const reservationId = `resitem_${crypto.randomUUID()}`;
            const rawQuantity = JSON.stringify({ value: String(quantity), precision: 20 });

            // Create Reservation
            await pool.query(`
                INSERT INTO reservation_item (
                    id, line_item_id, location_id, quantity, raw_quantity,
                    inventory_item_id, allow_backorder, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, now(), now()
                )
            `, [reservationId, item.line_item_id, locationId, quantity, rawQuantity, inventoryItemId,Boolean(item.allow_backorder)]);
            await pool.query(`UPDATE inventory_level SET reserved_quantity=reserved_quantity+$1,
              raw_reserved_quantity=jsonb_build_object('value',(reserved_quantity+$1)::text,'precision',20),updated_at=now() WHERE id=$2`,[quantity,level.id]);

            console.log(`   + Reserved ${item.quantity} of "${item.title}"`);
            }
        }

        console.log('✅ Reservations created.');
        return { success: true };

    });
}

/**
 * Shared post-convert readiness for both Razorpay and COD.
 * Without shipping method + reservations, Medusa fulfillment lines stay empty
 * and Admin looks like it needs manual inventory allocate.
 */
export async function ensurePlacedOrderFulfillmentReady(orderId: string) {
    if (!orderId?.trim()) {
        return {
            shipping: { success: false as const, error: "missing_order_id" },
            reservations: { success: false as const, error: "missing_order_id" },
        };
    }
    console.log(`ensurePlacedOrderFulfillmentReady: ${orderId}`);
    const shipping = await ensureOrderShippingMethod(orderId);
    const reservations = await ensureOrderReservations(orderId);
    return { shipping, reservations };
}

/**
 * Release any inventory reservations tied to an order's line items.
 * Used when online payment fails/abandons so stock is not held for a non-order.
 */
export async function releaseOrderInventoryReservations(orderId: string) {
    if (!orderId?.trim()) return { success: false as const, error: "missing_order_id", released: 0 };
    if (!process.env.DATABASE_URL) return { success: false as const, error: "No DB URL", released: 0 };

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["order-payment:" + orderId]);
        const paidOrder = await client.query(
            `SELECT id FROM "order" WHERE id=$1 AND (metadata->>'razorpay_payment_status' IN ('captured','paid','authorized') OR metadata->>'cod_status'='confirmed')`, [orderId]
        );
        if (paidOrder.rows.length) {
            await client.query("COMMIT"); client.release(); await pool.end();
            return { success: true as const, released: 0 };
        }


        const reservationsRes = await client.query(
            `SELECT DISTINCT ri.id, ri.inventory_item_id, ri.location_id, ri.quantity
             FROM reservation_item ri
             INNER JOIN order_item oi ON oi.item_id = ri.line_item_id
             WHERE oi.order_id = $1 AND ri.deleted_at IS NULL`,
            [orderId]
        );

        const rows = reservationsRes.rows as Array<{
            id: string;
            inventory_item_id: string;
            location_id: string;
            quantity: string | number;
        }>;

        if (!rows.length) {
            await client.query("COMMIT");
            client.release();
            await pool.end();
            return { success: true as const, released: 0 };
        }

        console.log(
            `📦 Releasing ${rows.length} inventory reservation(s) for failed/abandoned order ${orderId}`
        );

        for (const row of rows) {
            const qty = Number(row.quantity) || 0;

            await client.query(`DELETE FROM reservation_item WHERE id = $1`, [row.id]);

            if (qty > 0 && row.inventory_item_id && row.location_id) {
                await client.query(
                    `UPDATE inventory_level
                     SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $1),
                         raw_reserved_quantity=jsonb_build_object('value',GREATEST(0,COALESCE(reserved_quantity,0)-$1)::text,'precision',20),
                         updated_at = now()
                     WHERE inventory_item_id = $2
                       AND location_id = $3`,
                    [qty, row.inventory_item_id, row.location_id]
                );
            }
        }

        await client.query("COMMIT");
        client.release();
        await pool.end();
        console.log(`✅ Released ${rows.length} reservation(s) for ${orderId}`);
        return { success: true as const, released: rows.length };
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // ignore
        }
        client.release();
        await pool.end();
        console.error("❌ Failed to release order inventory reservations:", err);
        return { success: false as const, error: String(err), released: 0 };
    }
}

export type FinalizeRazorpayPaymentInput = {
    orderId: string;
    amountMinor: number;
    currencyCode: string;
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
    reconciledAt?: string;
};

/**
 * Record Razorpay capture in Medusa payment tables + order_transaction + admin payment status.
 */
export async function finalizeRazorpayOrderPayment(input: FinalizeRazorpayPaymentInput) {
    const pool = capturePool();
    try {
        return await recordCaptureAtomically(pool, input);
    } catch (error) {
        console.error("Atomic payment recording failed", error);
          await enqueuePaymentWork(pool,"capture_repair",input.orderId,{payment_id:input.razorpayPaymentId,gateway_order_id:input.razorpayOrderId||null}).catch(()=>undefined);
        return { ok: false, paymentCreated: false, transactionCreated: false, skipped: false,
            error: error instanceof Error ? error.message : "capture_recording_failed" };
    }
}

export async function resolveOrderPayableAmountMinor(orderId: string, loadedMetadata?: Record<string, unknown>): Promise<number | null> {
    if (!process.env.DATABASE_URL) return null;

    const pool = capturePool();

    const metadata = loadedMetadata ?? ((await pool.query(`SELECT metadata FROM "order" WHERE id = $1`, [orderId])).rows[0]?.metadata || {}) as Record<string, unknown>;

    if (typeof metadata.razorpay_amount_minor === "number" && metadata.razorpay_amount_minor > 0) {
        return Math.round(metadata.razorpay_amount_minor);
    }
    if (typeof metadata.medusa_total_minor === "number" && metadata.medusa_total_minor > 0) {
        return Math.round(metadata.medusa_total_minor);
    }

    const summaryRes = await pool.query(
        `SELECT totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
        [orderId]
    );
    const totals = (summaryRes.rows[0]?.totals || {}) as Record<string, unknown>;
    const orderTotal = Number(totals.current_order_total ?? totals.original_order_total ?? 0);
    if (orderTotal > 0) {
        return Math.round(orderTotal * 100);
    }
    return null;
}
