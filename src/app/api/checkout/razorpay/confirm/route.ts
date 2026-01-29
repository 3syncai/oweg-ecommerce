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

    // AFFILIATE COMMISSION: Call the commission webhook for hierarchy support
    if (medusaOrderId && typeof amountMinor === "number") {
      try {
        console.log("razorpay confirm: Triggering commission webhook for hierarchy...");

        const pool = getPool();
        if (!pool) throw new Error('Database not configured');

        // Get customer and order item info
        const customerResult = await pool.query(
          `SELECT 
             c.id, 
             c.email, 
             c.first_name || ' ' || c.last_name as name,
             c.metadata->>'referral_code' as referral_code
           FROM "order" o
           JOIN customer c ON o.customer_id = c.id
           WHERE o.id = $1`,
          [medusaOrderId]
        );

        const customer = customerResult.rows[0];
        const affiliateCode = customer?.referral_code;

        if (affiliateCode) {
          console.log(`razorpay confirm: Found affiliate code ${affiliateCode}, calling webhook...`);

          // Get order items
          const itemsResult = await pool.query(
            `SELECT 
               oi.id, 
               pv.product_id,
               oi.quantity,
               oli.unit_price,
               p.title as product_name
             FROM order_item oi
             JOIN order_line_item oli ON oi.item_id = oli.id
             LEFT JOIN product_variant pv ON oli.variant_id = pv.id
             LEFT JOIN product p ON pv.product_id = p.id
             WHERE oi.order_id = $1`,
            [medusaOrderId]
          );

          // Call webhook for each item (same as Medusa subscriber)
          const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL;

          if (!webhookUrl) {
            console.error("razorpay confirm: ⚠️ AFFILIATE_WEBHOOK_URL not set, skipping commission webhook");
          } else {
            for (const item of itemsResult.rows) {
              const unitPrice = parseFloat(item.unit_price || 0);
              const itemAmount = unitPrice * (item.quantity || 1);

              const payload = {
                order_id: medusaOrderId,
                affiliate_code: affiliateCode,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                item_price: unitPrice / 100, // Convert to rupees
                order_amount: itemAmount,
                status: "PENDING",
                customer_id: customer.id,
                customer_name: customer.name,
                customer_email: customer.email,
              };

              console.log(`razorpay confirm: Sending webhook for ${item.product_name}...`);

              try {
                const response = await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });

                if (response.ok) {
                  const result = await response.json();
                  console.log(`✅ Webhook success for ${item.product_name}:`, result);
                } else {
                  const error = await response.text();
                  console.error(`❌ Webhook failed for ${item.product_name}:`, error);
                }
              } catch (fetchErr) {
                console.error(`❌ Webhook fetch error for ${item.product_name}:`, fetchErr);
              }
            }
          }
        } else {
          console.log("razorpay confirm: No affiliate code, skipping commission");
        }
      } catch (affiliateErr) {
        console.error("razorpay confirm: ⚠️ Affiliate webhook failed:", affiliateErr);
      }
    }

    return NextResponse.json({ ok: true, paymentCreated });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
