import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateOrderMetadata,
  registerOrderTransaction,
  captureOrderPayment,
} from "@/lib/medusa-admin";
import { createMedusaPayment, createOrderTransaction, updateOrderSummaryTotals, ensureOrderShippingMethod, ensureOrderReservations } from "@/lib/medusa-payment";
import { applyCoinDiscountToOrder } from "@/lib/order-discount";
import { Pool } from 'pg';

// Shared pool instance at module level to avoid creating multiple connections per request
let sharedPool: Pool | null = null;

function getPool(): Pool | null {
  if (!sharedPool && process.env.DATABASE_URL) {
    sharedPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return sharedPool;
}

type ConfirmBody = {
  medusaOrderId?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  amount_minor?: number; // paise
  currency?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function verifyCheckoutSignature(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest("hex");
  return generated === payload.razorpay_signature;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ConfirmBody;
    const { medusaOrderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;
    const amountMinor = typeof body.amount_minor === "number" ? body.amount_minor : undefined;
    const currency = typeof body.currency === "string" ? body.currency : undefined;
    const currencyCode = (currency || "INR").toLowerCase();

    if (!medusaOrderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return badRequest("Missing payment details");
    }

    const verified = verifyCheckoutSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!verified) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    // Store all payment data in metadata
    const metadata = {
      razorpay_payment_status: "captured",
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      razorpay_amount_minor: amountMinor,
      razorpay_paid_total: amountMinor,
      razorpay_payment_status_confirmed: "captured",
      razorpay_captured_at: new Date().toISOString(),
      medusa_total_minor: amountMinor,
      medusa_amount_scale: "checkout_confirm",
      amount_reconcile_matched: true,
    };

    // Persist metadata
    const metaRes = await updateOrderMetadata(medusaOrderId, metadata);
    if (!metaRes.ok) {
      console.error("razorpay confirm: metadata update failed", { status: metaRes.status, data: metaRes.data });
    }

    // FORCE RESERVATIONS AND SHIPPING METHOD
    // This is critical for Medusa v2 fulfillment to work correctly.
    // Without reservations, fulfillment items will be empty.
    if (medusaOrderId) {
      console.log("razorpay confirm: Ensuring order readiness...");
      await ensureOrderShippingMethod(medusaOrderId);
      await ensureOrderReservations(medusaOrderId);
    }

    // Create payment record in Medusa payment tables (payment_collection, payment_session, payment)
    let paymentCreated = false;
    if (amountMinor !== undefined) {
      console.log("razorpay confirm: creating Medusa payment record...");
      const paymentResult = await createMedusaPayment({
        order_id: medusaOrderId,
        amount: amountMinor, // Already in paise from checkout
        currency_code: currencyCode,
        provider_id: "razorpay",
        data: {
          status: "captured",
          captured: true,
          amount_in_paise: amountMinor,
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
          captured_at: new Date().toISOString(),
        },
      });

      if (paymentResult.success) {
        paymentCreated = true;
        console.log("razorpay confirm: ✅ Medusa payment record created");
      } else {
        console.error("razorpay confirm: ❌ Failed to create Medusa payment:", paymentResult.error);
      }
    }

    // Also try API-based capture methods (fallback)
    if (!paymentCreated && amountMinor !== undefined) {
      const captureRes = await captureOrderPayment(medusaOrderId, {
        amount: amountMinor,
        currency_code: currencyCode,
        payment_id: razorpay_payment_id,
        metadata: {
          razorpay_payment_id,
          razorpay_order_id,
          provider: "razorpay",
        },
      });
      if (captureRes.ok) {
        paymentCreated = true;
        console.log("razorpay confirm: payment captured via API");
      }
    }

    // CRITICAL: Create OrderTransaction record for proper paid_total tracking
    // This fixes the "Refund" bar issue in Medusa Admin
    if (typeof amountMinor === "number") {
      // Convert Paise (minor units) to Rupees (major units) for Medusa v2
      const amountRupees = amountMinor / 100;

      console.log("razorpay confirm: creating OrderTransaction...");
      console.log(`  Amount: ₹${amountRupees} (from ${amountMinor} paise)`);

      const txResult = await createOrderTransaction({
        order_id: medusaOrderId,
        amount: amountRupees,  // RUPEES (major units)
        currency_code: currencyCode,
        reference: "capture",
        reference_id: razorpay_payment_id,
        // NOTE: order_transaction table does not have metadata column
      });

      if (txResult.success) {
        console.log("razorpay confirm: ✅ OrderTransaction created");

        // Sync order_summary.totals with the new transaction
        const summaryResult = await updateOrderSummaryTotals(medusaOrderId);
        if (summaryResult.success) {
          console.log("razorpay confirm: ✅ Order summary synced - paid_total updated");
        } else {
          console.warn("razorpay confirm: ⚠️ Order summary sync failed:", summaryResult.error);
        }
      } else {
        console.error("razorpay confirm: ❌ Failed to create OrderTransaction:", txResult.error);
        // Also try the old API method as fallback
        const txRes = await registerOrderTransaction(medusaOrderId, {
          amount: amountRupees,  // Use Rupees here too
          currency_code: currencyCode,
          reference: "capture",
          provider: "razorpay",
          metadata: {
            razorpay_payment_id,
            razorpay_order_id,
          },
        });
        if (txRes.ok) {
          console.log("razorpay confirm: ✅ OrderTransaction created via API fallback");
        }
      }
    }

    // COIN DISCOUNT: apply as order discount (not as payment transaction)
    // Uses order metadata set during draft-order creation.
    try {
      const pool = getPool();
      if (!pool) throw new Error("Database not configured");

      const metaResult = await pool.query(
        `SELECT metadata FROM "order" WHERE id = $1`,
        [medusaOrderId]
      );
      const dbMetadata = metaResult.rows[0]?.metadata || {};
      const coinMinor =
        typeof dbMetadata?.coin_discount_minor === "number"
          ? dbMetadata.coin_discount_minor
          : typeof dbMetadata?.coin_discount_rupees === "number"
            ? Math.round(dbMetadata.coin_discount_rupees * 100)
            : 0;

      if (coinMinor > 0) {
        await applyCoinDiscountToOrder({
          orderId: medusaOrderId,
          discountMinor: coinMinor
        });
      }
    } catch (coinError) {
      console.error("Coin discount update error:", coinError);
    }

    // AFFILIATE COMMISSION: Check if customer was referred and log commission
    if (medusaOrderId && typeof amountMinor === "number") {
      try {
        console.log("razorpay confirm: Checking affiliate commission...");

        const pool = getPool();
        if (!pool) throw new Error('Database not configured');

        // Get customer info including referral_code from customer_referral table
        const customerResult = await pool.query(
          `SELECT c.id, cr.referral_code, c.email, c.first_name || ' ' || c.last_name as name
           FROM "order" o
           JOIN customer c ON o.customer_id = c.id
           LEFT JOIN customer_referral cr ON c.id = cr.customer_id
           WHERE o.id = $1`,
          [medusaOrderId]
        );

        const customer = customerResult.rows[0];
        const affiliateCode = customer?.referral_code;

        console.log(`razorpay confirm: Customer ${customer?.email}, referral_code: ${affiliateCode || 'none'}`);

        if (affiliateCode) {
          console.log(`razorpay confirm: Customer ${customer.email} has affiliate code ${affiliateCode}`);


          // Get order items with product/category/collection info
          // Medusa 2.0 schema: order_item.item_id → order_line_item.id, order_line_item.variant_id → product_variant
          console.log(`razorpay confirm: [COMMISSION DEBUG] Querying order items for ${medusaOrderId}`);

          // NOTE: oli.total does not exist, so we calculate from unit_price * quantity
          const itemsResult = await pool.query(
            `SELECT 
               oi.id, 
               pv.product_id,
               oi.quantity,
               oli.unit_price,
               oli.variant_id,
               p.title as product_name,
               p.collection_id
             FROM order_item oi
             JOIN order_line_item oli ON oi.item_id = oli.id
             LEFT JOIN product_variant pv ON oli.variant_id = pv.id
             LEFT JOIN product p ON pv.product_id = p.id
             WHERE oi.order_id = $1`,
            [medusaOrderId]
          );

          console.log(`razorpay confirm: [COMMISSION DEBUG] Found ${itemsResult.rows.length} order items`);
          console.log(`razorpay confirm: [COMMISSION DEBUG] Items:`, JSON.stringify(itemsResult.rows));

          let totalCommission = 0;

          for (const item of itemsResult.rows) {
            console.log(`razorpay confirm: [COMMISSION DEBUG] Processing item: ${item.product_name}, product_id: ${item.product_id}`);

            // Calculate commission for this item using unit_price * quantity
            const unitPrice = parseFloat(item.unit_price || 0);
            const itemAmount = unitPrice * (item.quantity || 1); // Price is already in major units (Rupees), no need to divide by 100
            console.log(`razorpay confirm: [COMMISSION DEBUG] Item amount: ₹${itemAmount} (price: ${unitPrice} x qty: ${item.quantity})`);

            // Get categories for this product
            let categoryIds: string[] = [];
            try {
              const categoryResult = await pool.query(
                `SELECT product_category_id FROM product_category_product WHERE product_id = $1`,
                [item.product_id]
              );
              categoryIds = categoryResult.rows.map((r: any) => r.product_category_id);
              console.log(`razorpay confirm: [COMMISSION DEBUG] Product categories:`, categoryIds);
            } catch (err) {
              console.log(`razorpay confirm: [COMMISSION DEBUG] Failed to get categories (skipping category rules): ${err}`);
            }

            // Check for product-specific commission first
            console.log(`razorpay confirm: [COMMISSION DEBUG] Checking product commission for: ${item.product_id}`);
            let commissionResult = await pool.query(
              `SELECT commission_rate FROM affiliate_commission WHERE product_id = $1 LIMIT 1`,
              [item.product_id]
            );
            console.log(`razorpay confirm: [COMMISSION DEBUG] Product commission result:`, commissionResult.rows);

            let commissionRate = 0;
            let commissionSource = 'none';
            let sourceId = null;

            if (commissionResult.rows.length > 0) {
              commissionRate = parseFloat(commissionResult.rows[0].commission_rate);
              commissionSource = 'product';
              sourceId = item.product_id;
              console.log(`razorpay confirm: [COMMISSION DEBUG] Found product commission: ${commissionRate}%`);
            } else if (categoryIds.length > 0) {
              // Check category commission
              console.log(`razorpay confirm: [COMMISSION DEBUG] Checking category commission for:`, categoryIds);
              commissionResult = await pool.query(
                `SELECT category_id, commission_rate FROM affiliate_commission 
                 WHERE category_id = ANY($1) 
                 ORDER BY commission_rate DESC LIMIT 1`,
                [categoryIds]
              );
              console.log(`razorpay confirm: [COMMISSION DEBUG] Category commission result:`, commissionResult.rows);

              if (commissionResult.rows.length > 0) {
                commissionRate = parseFloat(commissionResult.rows[0].commission_rate);
                commissionSource = 'category';
                sourceId = commissionResult.rows[0].category_id;
                console.log(`razorpay confirm: [COMMISSION DEBUG] Found category commission: ${commissionRate}%`);
              }
            }

            if (commissionSource === 'none' && item.collection_id) {
              // Check collection commission
              console.log(`razorpay confirm: [COMMISSION DEBUG] Checking collection commission for: ${item.collection_id}`);
              commissionResult = await pool.query(
                `SELECT commission_rate FROM affiliate_commission WHERE collection_id = $1 LIMIT 1`,
                [item.collection_id]
              );
              console.log(`razorpay confirm: [COMMISSION DEBUG] Collection commission result:`, commissionResult.rows);

              if (commissionResult.rows.length > 0) {
                commissionRate = parseFloat(commissionResult.rows[0].commission_rate);
                commissionSource = 'collection';
                sourceId = item.collection_id;
                console.log(`razorpay confirm: [COMMISSION DEBUG] Found collection commission: ${commissionRate}%`);
              }
            }

            console.log(`razorpay confirm: [COMMISSION DEBUG] Final: source=${commissionSource}, rate=${commissionRate}%`);

            // Only log commission if a rule was found
            if (commissionRate > 0) {
              const commissionAmount = (itemAmount * commissionRate) / 100;
              totalCommission += commissionAmount;

              // Get affiliate_user_id
              const affiliateResult = await pool.query(
                `SELECT id FROM affiliate_user WHERE refer_code = $1`,
                [affiliateCode]
              );
              const affiliateUserId = affiliateResult.rows[0]?.id || null;

              // Check if commission already logged for this order/item (idempotency)
              const existingCommission = await pool.query(
                `SELECT id FROM affiliate_commission_log WHERE order_id = $1 AND variant_id = $2`,
                [medusaOrderId, item.variant_id]
              );

              if (existingCommission.rows.length > 0) {
                console.log(`razorpay confirm: Commission already logged for ${item.product_name}`);
                continue;
              }

              // Log commission (status PENDING - will be credited after delivery)
              await pool.query(
                `INSERT INTO affiliate_commission_log 
                   (affiliate_code, affiliate_user_id, order_id, customer_id, product_id, 
                    product_name, variant_id, quantity, item_price, order_amount,
                    commission_rate, commission_amount, commission_source, category_id, collection_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING')`,
                [affiliateCode, affiliateUserId, medusaOrderId, customer.id, item.product_id,
                  item.product_name, item.variant_id, item.quantity, parseFloat(item.unit_price) / 100, itemAmount,
                  commissionRate, commissionAmount, commissionSource,
                  commissionSource === 'category' ? sourceId : null,
                  commissionSource === 'collection' ? sourceId : null]
              );

              console.log(`razorpay confirm: Commission logged: ₹${commissionAmount.toFixed(2)} for ${item.product_name} (${commissionSource} @ ${commissionRate}%)`);
            }
          }

          // Update referral stats
          if (totalCommission > 0 || itemsResult.rows.length > 0) {
            const orderValue = amountMinor / 100;
            await pool.query(
              `UPDATE affiliate_referrals
               SET total_orders = total_orders + 1,
                   total_order_value = total_order_value + $3,
                   total_commission = total_commission + $4,
                   first_order_at = COALESCE(first_order_at, NOW())
               WHERE affiliate_code = $1 AND customer_id = $2`,
              [affiliateCode, customer.id, orderValue, totalCommission]
            );
          }

          if (totalCommission > 0) {
            console.log(`razorpay confirm: ✅ Total affiliate commission: ₹${totalCommission.toFixed(2)} for ${affiliateCode} (PENDING)`);
          } else {
            console.log("razorpay confirm: No commission earned (no matching commission rules)");
          }
        } else {
          console.log("razorpay confirm: Customer not referred by affiliate");
        }
        // Note: pool.end() removed - using shared pool
      } catch (affiliateErr) {
        console.error("razorpay confirm: ⚠️ Affiliate commission failed:", affiliateErr);
        // Don't fail the payment confirmation if affiliate commission fails
      }
    }

    return NextResponse.json({ ok: true, paymentCreated });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
