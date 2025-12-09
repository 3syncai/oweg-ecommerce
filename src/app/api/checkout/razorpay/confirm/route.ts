import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateOrderMetadata,
  registerOrderTransaction,
  captureOrderPayment,
} from "@/lib/medusa-admin";
import { createMedusaPayment, createOrderTransaction, updateOrderSummaryTotals, ensureOrderShippingMethod, ensureOrderReservations } from "@/lib/medusa-payment";

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

    return NextResponse.json({ ok: true, paymentCreated });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
