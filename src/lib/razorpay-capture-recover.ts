import { Pool } from "pg";
import {
  ensurePlacedCheckoutOrder,
  loadCheckoutOrder,
  runPostConvertCheckoutSideEffects,
  type CheckoutOrderRecord,
} from "@/lib/checkout-order";
import { updateOrderMetadata } from "@/lib/medusa-admin";
import {
  finalizeRazorpayOrderPayment,
  resolveOrderPayableAmountMinor,
} from "@/lib/medusa-payment";
import {
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  isRazorpayPaymentSuccessful,
  type RazorpayPaymentEntity,
} from "@/lib/razorpay";
import {
  loadCheckoutPaymentSnapshot,
  loadCheckoutPaymentSnapshotByRazorpayOrderId,
  recreateDraftFromCheckoutSnapshot,
  buildCheckoutSnapshotFromOrderId,
  saveCheckoutPaymentSnapshot,
} from "@/lib/checkout-payment-snapshot";
import {
  acquireCaptureClaim,
  setCaptureClaimOrder,
  waitForCaptureClaimOrder,
  getCaptureClaim,
} from "@/lib/razorpay-capture-claim";

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export type CaptureRecoveryResult =
  | {
      ok: true;
      orderId: string;
      recovered: boolean;
      alreadyPlaced?: boolean;
      paymentCreated?: boolean;
    }
  | {
      ok: false;
      error: "orphan_capture" | "not_captured" | "invalid_input" | "internal_error";
      razorpay_payment_id?: string;
      action?: "ops_recover";
      detail?: string;
    };

/** Find a Medusa order (placed or draft) that already recorded this Razorpay payment. */
export async function findOrderIdByRazorpayPaymentId(
  razorpayPaymentId: string
): Promise<string | null> {
  const pool = createPool();
  if (!pool || !razorpayPaymentId) return null;
  try {
    const res = await pool.query(
      `SELECT id FROM "order"
       WHERE deleted_at IS NULL
         AND metadata->>'razorpay_payment_id' = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [razorpayPaymentId]
    );
    return res.rows[0]?.id ? String(res.rows[0].id) : null;
  } catch (err) {
    console.warn("findOrderIdByRazorpayPaymentId failed", err);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function getSuccessfulRazorpayPaymentForOrder(
  razorpayOrderId: string
): Promise<(RazorpayPaymentEntity & { notes?: Record<string, string> }) | null> {
  if (!razorpayOrderId) return null;
  try {
    const items = await fetchRazorpayOrderPayments(razorpayOrderId);
    const hit = items.find((p) => isRazorpayPaymentSuccessful(p.status));
    return hit || null;
  } catch (err) {
    console.warn("getSuccessfulRazorpayPaymentForOrder failed", razorpayOrderId, err);
    return null;
  }
}

/**
 * Place + finalize from a verified Razorpay capture when the Medusa draft/order
 * may be tombstoned or briefly missing. Idempotent on razorpay_payment_id.
 */
export async function recoverRazorpayCapture(input: {
  medusaOrderId?: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  amountMinor?: number;
  currencyCode?: string;
  /** When true, trust HMAC-verified caller and skip Razorpay payment GET (QA / confirm path). */
  skipRemotePaymentLookup?: boolean;
}): Promise<CaptureRecoveryResult> {
  const paymentId = input.razorpayPaymentId?.trim();
  if (!paymentId) {
    return { ok: false, error: "invalid_input", detail: "razorpay_payment_id required" };
  }

  try {
    // Idempotent: already placed under this payment id
    const existingId = await findOrderIdByRazorpayPaymentId(paymentId);
    if (existingId) {
      const loaded = await loadCheckoutOrder(existingId);
      if (loaded && !loaded.isDraft) {
        const amount =
          input.amountMinor && input.amountMinor > 0
            ? input.amountMinor
            : (await resolveOrderPayableAmountMinor(existingId)) || 0;
        if (amount > 0) {
          await finalizeRazorpayOrderPayment({
            orderId: existingId,
            amountMinor: amount,
            currencyCode: (input.currencyCode || "inr").toLowerCase(),
            razorpayPaymentId: paymentId,
            razorpayOrderId: input.razorpayOrderId,
            razorpaySignature: input.razorpaySignature,
          });
        }
        return {
          ok: true,
          orderId: existingId,
          recovered: false,
          alreadyPlaced: true,
          paymentCreated: true,
        };
      }
      if (loaded?.isDraft) {
        const placed = await ensurePlacedCheckoutOrder(existingId);
        if (placed) {
          return await finalizePlacedCapture({
            orderId: placed.orderId,
            order: placed.order,
            paymentId,
            razorpayOrderId: input.razorpayOrderId,
            razorpaySignature: input.razorpaySignature,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
            recovered: true,
          });
        }
      }
    }

    // Prefer local tombstone / draft first (HMAC-verified confirm) so we can place
    // without depending on Razorpay payment GET (supports QA fake pay ids).
    const localCandidates = [input.medusaOrderId].filter(
      (v): v is string => Boolean(v && String(v).trim())
    );
    for (const candidate of localCandidates) {
      const loaded = await loadCheckoutOrder(candidate);
      if (!loaded) continue;
      const placed = await ensurePlacedCheckoutOrder(candidate);
      if (!placed) {
        console.warn("recover: ensurePlaced failed for tombstone", candidate);
        continue;
      }
      return await finalizePlacedCapture({
        orderId: placed.orderId,
        order: placed.order,
        paymentId,
        razorpayOrderId: input.razorpayOrderId,
        razorpaySignature: input.razorpaySignature,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        recovered: true,
      });
    }

    // Parent draft deleted: rebuild from durable checkout snapshot (local DB).
    const rebuilt = await tryRebuildFromSnapshot({
      medusaOrderId: input.medusaOrderId,
      razorpayOrderId: input.razorpayOrderId,
      paymentId,
      razorpaySignature: input.razorpaySignature,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
    });
    if (rebuilt) return rebuilt;

    if (input.skipRemotePaymentLookup) {
      return {
        ok: false,
        error: "orphan_capture",
        razorpay_payment_id: paymentId,
        action: "ops_recover",
        detail: `no local tombstone/snapshot for ${localCandidates.join(",")}`,
      };
    }

    // Verify with Razorpay when local draft is gone
    let payment: RazorpayPaymentEntity & { notes?: Record<string, string> };
    try {
      payment = (await fetchRazorpayPayment(paymentId)) as RazorpayPaymentEntity & {
        notes?: Record<string, string>;
      };
    } catch (err) {
      return {
        ok: false,
        error: "internal_error",
        razorpay_payment_id: paymentId,
        detail: String(err),
      };
    }

    if (!isRazorpayPaymentSuccessful(payment.status)) {
      return {
        ok: false,
        error: "not_captured",
        razorpay_payment_id: paymentId,
        detail: `status=${payment.status}`,
      };
    }

    const notesMedusaId =
      typeof payment.notes?.medusa_order_id === "string"
        ? payment.notes.medusa_order_id
        : typeof payment.notes?.medusaOrderId === "string"
          ? payment.notes.medusaOrderId
          : undefined;
    const candidateIds = [input.medusaOrderId, notesMedusaId].filter(
      (v): v is string => Boolean(v && String(v).trim())
    );

    const rzpOrderId = input.razorpayOrderId || payment.order_id;
    for (const candidate of candidateIds) {
      const loaded = await loadCheckoutOrder(candidate);
      if (!loaded) continue;

      const placed = await ensurePlacedCheckoutOrder(candidate);
      if (!placed) continue;

      return await finalizePlacedCapture({
        orderId: placed.orderId,
        order: placed.order,
        paymentId,
        razorpayOrderId: rzpOrderId,
        razorpaySignature: input.razorpaySignature,
        amountMinor: input.amountMinor || payment.amount,
        currencyCode: input.currencyCode || payment.currency,
        recovered: true,
      });
    }

    const rebuiltRemote = await tryRebuildFromSnapshot({
      medusaOrderId: notesMedusaId || input.medusaOrderId,
      razorpayOrderId: rzpOrderId,
      paymentId,
      razorpaySignature: input.razorpaySignature,
      amountMinor: input.amountMinor || payment.amount,
      currencyCode: input.currencyCode || payment.currency,
    });
    if (rebuiltRemote) return rebuiltRemote;

    // Last resort: remnant order_item rows → snapshot → rebuild
    if (notesMedusaId || input.medusaOrderId) {
      const remnantId = notesMedusaId || input.medusaOrderId!;
      const remnantSnap = await buildCheckoutSnapshotFromOrderId(remnantId, {
        razorpay_order_id: rzpOrderId,
      });
      if (remnantSnap?.items?.length) {
        await saveCheckoutPaymentSnapshot(remnantSnap);
        const rebuiltRemnant = await tryRebuildFromSnapshot({
          medusaOrderId: remnantId,
          razorpayOrderId: rzpOrderId,
          paymentId,
          razorpaySignature: input.razorpaySignature,
          amountMinor: input.amountMinor || payment.amount,
          currencyCode: input.currencyCode || payment.currency,
        });
        if (rebuiltRemnant) return rebuiltRemnant;
      }
    }

    return {
      ok: false,
      error: "orphan_capture",
      razorpay_payment_id: paymentId,
      action: "ops_recover",
      detail: `no medusa tombstone/snapshot for candidates=${candidateIds.join(",")}`,
    };
  } catch (err) {
    console.error("recoverRazorpayCapture failed", err);
    return {
      ok: false,
      error: "internal_error",
      razorpay_payment_id: paymentId,
      detail: String(err),
    };
  }
}

async function tryRebuildFromSnapshot(input: {
  medusaOrderId?: string;
  razorpayOrderId?: string;
  paymentId: string;
  razorpaySignature?: string;
  amountMinor?: number;
  currencyCode?: string;
}): Promise<CaptureRecoveryResult | null> {
  // Soft metadata path (already finalized once)
  const existingByPay = await findOrderIdByRazorpayPaymentId(input.paymentId);
  if (existingByPay) {
    return finalizeExistingRebuildOrder(existingByPay, input);
  }

  let snap =
    (input.medusaOrderId
      ? await loadCheckoutPaymentSnapshot(input.medusaOrderId)
      : null) ||
    (input.razorpayOrderId
      ? await loadCheckoutPaymentSnapshotByRazorpayOrderId(input.razorpayOrderId)
      : null);

  // Remnants / late build when mint-time snapshot was never written
  if (!snap?.items?.length && input.medusaOrderId) {
    const remnant = await buildCheckoutSnapshotFromOrderId(input.medusaOrderId, {
      razorpay_order_id: input.razorpayOrderId,
    });
    if (remnant?.items?.length) {
      await saveCheckoutPaymentSnapshot(remnant);
      snap = remnant;
    }
  }

  if (!snap?.items?.length) {
    console.warn("tryRebuildFromSnapshot: no usable snapshot", {
      medusaOrderId: input.medusaOrderId,
      razorpayOrderId: input.razorpayOrderId,
      hasSnap: Boolean(snap),
      itemCount: snap?.items?.length || 0,
    });
    return null;
  }

  // Short-circuit if original snapshot already points at a rebuilt order
  const rebuiltId =
    typeof (snap.metadata as Record<string, unknown> | null | undefined)
      ?.rebuilt_medusa_order_id === "string"
      ? String((snap.metadata as Record<string, unknown>).rebuilt_medusa_order_id)
      : null;
  if (rebuiltId) {
    const loaded = await loadCheckoutOrder(rebuiltId);
    if (loaded) {
      const placed = loaded.isDraft
        ? await ensurePlacedCheckoutOrder(rebuiltId)
        : { orderId: rebuiltId, order: loaded.order };
      if (placed) {
        await setCaptureClaimOrder(input.paymentId, placed.orderId, "placed");
        return finalizePlacedCapture({
          orderId: placed.orderId,
          order: placed.order,
          paymentId: input.paymentId,
          razorpayOrderId: input.razorpayOrderId || snap.razorpay_order_id || undefined,
          razorpaySignature: input.razorpaySignature,
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          recovered: true,
        });
      }
    }
  }

  const acquired = await acquireCaptureClaim(input.paymentId);
  if (!acquired) {
    console.warn("tryRebuildFromSnapshot: claim acquire failed", input.paymentId);
    return null;
  }

  if (acquired.role === "follower") {
    let orderId =
      acquired.medusaOrderId ||
      (await waitForCaptureClaimOrder(input.paymentId)) ||
      (await findOrderIdByRazorpayPaymentId(input.paymentId));

    // Brief retry — winner may still be converting the draft.
    for (let i = 0; i < 8 && orderId; i++) {
      const finalized = await finalizeExistingRebuildOrder(orderId, input);
      if (finalized) return finalized;
      await new Promise((r) => setTimeout(r, 300));
      orderId =
        (await getCaptureClaim(input.paymentId))?.medusa_order_id ||
        (await findOrderIdByRazorpayPaymentId(input.paymentId)) ||
        orderId;
    }

    if (!orderId) {
      console.warn("tryRebuildFromSnapshot: follower timed out", input.paymentId);
      return null;
    }

    // Last attempt
    return finalizeExistingRebuildOrder(orderId, input);
  }

  // Winner: create at most one draft for this payment id
  console.info("tryRebuildFromSnapshot: winner rebuilding", {
    from: snap.medusa_order_id,
    items: snap.items.length,
    rzp: snap.razorpay_order_id,
    paymentId: input.paymentId,
  });

  // Re-check under claim (another path may have finished)
  const raced = await findOrderIdByRazorpayPaymentId(input.paymentId);
  if (raced) {
    await setCaptureClaimOrder(input.paymentId, raced, "placed");
    return finalizeExistingRebuildOrder(raced, input);
  }

  const created = await recreateDraftFromCheckoutSnapshot(snap);
  if (!created?.orderId) {
    console.warn("tryRebuildFromSnapshot: recreate failed", snap.medusa_order_id);
    return null;
  }

  // Publish order id immediately so followers stop waiting / don't create
  await setCaptureClaimOrder(input.paymentId, created.orderId, "claimed");

  console.info("tryRebuildFromSnapshot: created", created.orderId);

  let placed = await ensurePlacedCheckoutOrder(created.orderId);
  for (let i = 0; !placed && i < 6; i++) {
    await new Promise((r) => setTimeout(r, 400));
    placed = await ensurePlacedCheckoutOrder(created.orderId);
  }
  if (!placed) {
    // Draft exists and is claimed — treat as recoverable via finalizeExisting rather than orphan.
    console.warn(
      "tryRebuildFromSnapshot: ensurePlaced soft-fail; finishing via claim",
      created.orderId
    );
    const viaClaim = await finalizeExistingRebuildOrder(created.orderId, input);
    if (viaClaim) return viaClaim;
    console.warn("tryRebuildFromSnapshot: ensurePlaced failed", created.orderId);
    return null;
  }

  await setCaptureClaimOrder(input.paymentId, placed.orderId, "placed");
  console.info("tryRebuildFromSnapshot: placed", placed.orderId);

  return finalizePlacedCapture({
    orderId: placed.orderId,
    order: placed.order,
    paymentId: input.paymentId,
    razorpayOrderId: input.razorpayOrderId || snap.razorpay_order_id || undefined,
    razorpaySignature: input.razorpaySignature,
    amountMinor: input.amountMinor,
    currencyCode: input.currencyCode,
    recovered: true,
  });
}

async function finalizeExistingRebuildOrder(
  orderId: string,
  input: {
    paymentId: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
    amountMinor?: number;
    currencyCode?: string;
  }
): Promise<CaptureRecoveryResult | null> {
  const loaded = await loadCheckoutOrder(orderId);
  if (!loaded) return null;
  if (!loaded.isDraft) {
    const amount =
      input.amountMinor && input.amountMinor > 0
        ? input.amountMinor
        : (await resolveOrderPayableAmountMinor(orderId)) || 0;
    if (amount > 0) {
      await finalizeRazorpayOrderPayment({
        orderId,
        amountMinor: amount,
        currencyCode: (input.currencyCode || "inr").toLowerCase(),
        razorpayPaymentId: input.paymentId,
        razorpayOrderId: input.razorpayOrderId,
        razorpaySignature: input.razorpaySignature,
      });
    }
    await setCaptureClaimOrder(input.paymentId, orderId, "placed");
    return {
      ok: true,
      orderId,
      recovered: false,
      alreadyPlaced: true,
      paymentCreated: true,
    };
  }
  const placed = await ensurePlacedCheckoutOrder(orderId);
  if (!placed) return null;
  await setCaptureClaimOrder(input.paymentId, placed.orderId, "placed");
  return finalizePlacedCapture({
    orderId: placed.orderId,
    order: placed.order,
    paymentId: input.paymentId,
    razorpayOrderId: input.razorpayOrderId,
    razorpaySignature: input.razorpaySignature,
    amountMinor: input.amountMinor,
    currencyCode: input.currencyCode,
    recovered: true,
  });
}

async function finalizePlacedCapture(input: {
  orderId: string;
  order: CheckoutOrderRecord;
  paymentId: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  amountMinor?: number;
  currencyCode?: string;
  recovered: boolean;
}): Promise<CaptureRecoveryResult> {
  const meta = (input.order.metadata || {}) as Record<string, unknown>;
  try {
    await runPostConvertCheckoutSideEffects(input.orderId, meta);
  } catch (err) {
    console.warn("recover: post-convert side effects failed", err);
  }

  const amount =
    input.amountMinor && input.amountMinor > 0
      ? Math.round(input.amountMinor)
      : (await resolveOrderPayableAmountMinor(input.orderId)) || 0;

  await updateOrderMetadata(input.orderId, {
    payment_method: "razorpay",
    razorpay_payment_status: "captured",
    razorpay_payment_id: input.paymentId,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_signature: input.razorpaySignature,
    razorpay_amount_minor: amount || undefined,
    razorpay_captured_at: new Date().toISOString(),
    checkout_status: "paid",
    razorpay_recovered_at: input.recovered ? new Date().toISOString() : undefined,
  });

  await setCaptureClaimOrder(input.paymentId, input.orderId, "placed");

  let paymentCreated = false;
  if (amount > 0) {
    const fin = await finalizeRazorpayOrderPayment({
      orderId: input.orderId,
      amountMinor: amount,
      currencyCode: (input.currencyCode || "inr").toLowerCase(),
      razorpayPaymentId: input.paymentId,
      razorpayOrderId: input.razorpayOrderId,
      razorpaySignature: input.razorpaySignature,
    });
    paymentCreated = Boolean(fin.paymentCreated || fin.skipped);
    await updateOrderMetadata(input.orderId, {
      razorpay_capture_status: fin.ok ? "captured" : "failed",
      razorpay_admin_reconcile_required: !fin.ok || !paymentCreated,
    });
  }

  return {
    ok: true,
    orderId: input.orderId,
    recovered: input.recovered,
    paymentCreated,
  };
}
