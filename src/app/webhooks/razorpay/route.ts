export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import {
  convertDraftOrder,
  deleteDraftOrder,
  getOrderById,
  registerOrderTransaction,
  setOrderPaidTotal,
  setOrderPaymentStatus,
  updateOrderMetadata,
} from "@/lib/medusa-admin";

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number; // amount in paise from Razorpay
  currency?: string;
  status?: string;
  notes?: Record<string, string>;
  entity?: RazorpayPaymentEntity;
};

const DEFAULT_CURRENCY = "INR";

type UnknownRecord = Record<string, unknown>;
type MedusaOrder = UnknownRecord & {
  metadata?: Record<string, unknown>;
  payment_collection_id?: unknown;
  paymentCollectionId?: unknown;
  payment_collection?: UnknownRecord;
  payment_collections?: Array<UnknownRecord>;
  cart?: UnknownRecord;
  payment_sessions?: Array<UnknownRecord>;
  payment_session?: UnknownRecord;
  payments?: Array<UnknownRecord>;
  payment?: UnknownRecord;
  payment_session_id?: unknown;
  payment_id?: unknown;
  total?: unknown;
  currency_code?: unknown;
  is_draft_order?: boolean;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function asRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asRecord(v))
    .filter((v): v is UnknownRecord => Boolean(v));
}

function extractOrder(data: unknown): MedusaOrder | null {
  const record = asRecord(data);
  if (!record) return null;
  const direct = asRecord(record.order);
  if (direct) return direct as MedusaOrder;
  const nested = record.data;
  if (nested) {
    if (Array.isArray(nested) && nested.length && asRecord(nested[0])) {
      return nested[0] as MedusaOrder;
    }
    const nestedRecord = asRecord(nested);
    if (nestedRecord?.order && typeof nestedRecord.order === "object") {
      return nestedRecord.order as MedusaOrder;
    }
  }
  return record as MedusaOrder;
}

function extractMessage(data: unknown): string | null {
  const record = asRecord(data);
  if (record) {
    const msg = record.message || record.error || record.error_message;
    if (typeof msg === "string") return msg;
  }
  return null;
}

function extractTransaction(data: unknown): UnknownRecord | null {
  const record = asRecord(data);
  if (!record) return null;
  if (record.transaction && typeof record.transaction === "object") {
    return record.transaction as UnknownRecord;
  }
  const orderTx = asRecord(record.order)?.transaction;
  if (orderTx && typeof orderTx === "object") return orderTx as UnknownRecord;
  const nested = record.data;
  if (Array.isArray(nested) && nested.length && typeof nested[0] === "object") {
    return nested[0] as UnknownRecord;
  }
  const nestedRecord = asRecord(nested);
  if (nestedRecord?.transaction && typeof nestedRecord.transaction === "object") {
    return nestedRecord.transaction as UnknownRecord;
  }
  return record;
}

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(cur: unknown): string {
  return typeof cur === "string" && cur.trim() ? cur.trim().toUpperCase() : DEFAULT_CURRENCY;
}

function reconcileAmounts(medusaTotalRaw: number, razorpayMinor: number) {
  const medusaMinorAssumed = Math.round(safeNumber(medusaTotalRaw)); // Medusa stores smallest unit
  const medusaMinorFromMajor = Math.round(safeNumber(medusaTotalRaw) * 100); // if Medusa total was rupees

  const matchesMedusaMinor = razorpayMinor > 0 && Math.abs(medusaMinorAssumed - razorpayMinor) <= 1;
  const matchesMedusaMajor = razorpayMinor > 0 && Math.abs(medusaMinorFromMajor - razorpayMinor) <= 1;

  if (matchesMedusaMinor) {
    return {
      matched: true,
      canonicalMajor: razorpayMinor / 100,
      canonicalMinor: razorpayMinor,
      detectedScale: "medusa_minor",
    };
  }

  if (matchesMedusaMajor) {
    return {
      matched: true,
      canonicalMajor: medusaMinorFromMajor / 100,
      canonicalMinor: medusaMinorFromMajor,
      detectedScale: "medusa_major_as_rupees",
    };
  }

  if (razorpayMinor > 0) {
    // Trust Razorpay payload to avoid dropping paid events; log mismatch upstream
    return {
      matched: false,
      canonicalMajor: razorpayMinor / 100,
      canonicalMinor: razorpayMinor,
      detectedScale: "fallback_razorpay_amount",
    };
  }

  if (medusaMinorAssumed > 0) {
    return {
      matched: false,
      canonicalMajor: medusaMinorAssumed / 100,
      canonicalMinor: medusaMinorAssumed,
      detectedScale: "fallback_medusa_amount",
    };
  }

  return {
    matched: false,
    canonicalMajor: 0,
    canonicalMinor: 0,
    detectedScale: "no_amount",
  };
}

function coerceId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function uniqStrings(values: Array<unknown>): string[] {
  return Array.from(
    new Set(
      values
        .map(coerceId)
        .filter((v): v is string => typeof v === "string" && !!v)
        .map((v) => v.trim())
    )
  );
}

function extractPaymentContext(order: MedusaOrder) {
  const paymentCollections = uniqStrings([
    order.payment_collection_id,
    order.paymentCollectionId,
    asRecord(order.payment_collection)?.id,
    asRecord(order.payment_collection)?.payment_collection_id,
    asRecordArray(order.payment_collections)?.[0]?.id,
    asRecord(asRecordArray(order.payment_collections)?.[0]?.payment_collection)?.id,
    asRecord(order.cart)?.payment_collection_id,
    asRecord(asRecord(order.cart)?.payment_collection)?.id,
    asRecord(order.metadata)?.payment_collection_id,
  ]);

  const paymentsArray = Array.isArray(order.payments)
    ? asRecordArray(order.payments)
    : asRecord(order.payment)
      ? [asRecord(order.payment)!]
      : [];

  const paymentSessions = [
    ...asRecordArray(order.payment_sessions),
    ...(asRecord(order.payment_session) ? [asRecord(order.payment_session)!] : []),
    ...(Array.isArray(order.payment_collections)
      ? asRecordArray(order.payment_collections).flatMap((pc) => [
          ...asRecordArray(pc.payment_sessions),
          ...asRecordArray(asRecord(pc.payment_collection)?.payment_sessions),
        ])
      : []),
    ...paymentsArray.map((p) => asRecord(p.payment_session)).filter(Boolean),
  ];

  const paymentSessionIds = uniqStrings([
    order.payment_session_id,
    ...paymentsArray.map((p) => (asRecord(p)?.payment_session_id as unknown)),
    ...paymentSessions.map((ps) => (asRecord(ps)?.id as unknown)),
  ]);

  const paymentIds = uniqStrings([
    order.payment_id,
    asRecord(order.payment)?.id,
    ...paymentsArray.map((p) => asRecord(p)?.id as unknown),
    ...(Array.isArray(order.payment_collections)
      ? asRecordArray(order.payment_collections).flatMap((pc) => [
          ...asRecordArray(pc.payments).map((p) => asRecord(p)?.id as unknown),
          ...asRecordArray(asRecord(pc.payment_collection)?.payments).map((p) => asRecord(p)?.id as unknown),
        ])
      : []),
    ...paymentSessions.map((ps) => {
      const rec = asRecord(ps);
      const payment = rec?.payment;
      return asRecord(ps)?.payment_id || (asRecord(payment)?.id as unknown);
    }),
    asRecord(order.metadata)?.payment_id,
  ]);

  return {
    paymentIds,
    paymentSessionIds,
    paymentCollectionId: paymentCollections[0],
  };
}

export async function POST(req: Request) {
  const rawArrayBuffer = await req.arrayBuffer();
  const rawBodyBuffer = Buffer.from(rawArrayBuffer);
  const rawBody = rawBodyBuffer.toString("utf8");
  const signature = req.headers.get("x-razorpay-signature") || "";
  // verify signature
  const valid = verifyRazorpaySignature(rawBodyBuffer, signature);
  if (!valid) {
    console.warn("razorpay webhook invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (err) {
    console.warn("razorpay webhook invalid json", err);
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = typeof payload.event === "string" ? payload.event : undefined;
  const payloadWrapper = asRecord(payload.payload);

  // Robust extraction
  const payment: RazorpayPaymentEntity =
    (payloadWrapper?.payment as RazorpayPaymentEntity)?.entity ||
    (payloadWrapper?.payment as RazorpayPaymentEntity) ||
    (payloadWrapper?.entity as RazorpayPaymentEntity) ||
    (asRecord(payloadWrapper?.payment)?.payment as RazorpayPaymentEntity) ||
    {};
  const orderEntity: UnknownRecord | undefined =
    (payloadWrapper?.order as UnknownRecord) ||
    (asRecord(payloadWrapper?.entity)?.order as UnknownRecord) ||
    undefined;

  // medusa_order_id resolution
  const medusaOrderId =
    payment?.notes?.medusa_order_id ||
    (asRecord(orderEntity?.notes)?.medusa_order_id as string | undefined) ||
    (orderEntity?.receipt as string | undefined) ||
    undefined;

  if (!medusaOrderId) {
    console.warn("razorpay webhook missing medusa_order_id", {
      event,
      paymentNotes: payment?.notes,
      orderEntityReceipt: orderEntity?.receipt,
    });
    return NextResponse.json({ error: "medusa order id missing" }, { status: 400 });
  }

  // Fetch Medusa order
  const orderRes = await getOrderById(medusaOrderId);
  const order = orderRes.data ? extractOrder(orderRes.data) : null;
  if (!orderRes.ok || !order) {
    console.warn("razorpay webhook order not found", medusaOrderId);
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const metadataStatus =
    typeof metadata.razorpay_payment_status === "string" ? metadata.razorpay_payment_status : undefined;
  const metadataPaymentId =
    typeof metadata.razorpay_payment_id === "string" ? metadata.razorpay_payment_id : undefined;
  const metadataOrderId =
    typeof metadata.razorpay_order_id === "string" ? metadata.razorpay_order_id : undefined;

  // Razorpay minor unit amount (paise)
  const razorpayAmountPaise = safeNumber(payment?.amount);
  const currency = normalizeCurrency(payment?.currency || orderEntity?.currency || order.currency_code);

  // Medusa reported totals
  const medusaReported = safeNumber(order.total); // ambiguous unit (we will reconcile)
  const expectedCurrency = normalizeCurrency(order.currency_code);

  // reconcile amounts
  const reconcile = reconcileAmounts(medusaReported, razorpayAmountPaise);
  if (!reconcile.matched) {
    console.warn("amount reconciliation mismatch, falling back to trusted amount", {
      medusaReported,
      razorpayAmountPaise,
      medusaCalculatedMinor: Math.round(medusaReported * 100),
      detectedScale: reconcile.detectedScale,
    });
  }

  const canonicalMinor = reconcile.canonicalMinor; // paise
  if (!canonicalMinor || canonicalMinor <= 0) {
    return NextResponse.json({ error: "amount missing" }, { status: 400 });
  }

  // Currency check
  if (expectedCurrency !== currency) {
    console.warn("razorpay webhook currency mismatch", { medusa: expectedCurrency, razorpay: currency });
    return NextResponse.json({ error: "currency mismatch" }, { status: 400 });
  }

  const paymentId = payment?.id;
  const razorpayOrderId = payment?.order_id || orderEntity?.id || metadataOrderId;
  const status = (payment?.status || "").toString().toLowerCase();

  const isAuthorized = event === "payment.authorized" || status === "authorized";
  const isCaptured = event === "payment.captured" || status === "captured" || isAuthorized;
  const isFailed = event === "payment.failed" || status === "failed";
  const paymentContext = extractPaymentContext(order);
  const prevCaptureStatus =
    typeof metadata.razorpay_capture_status === "string"
      ? metadata.razorpay_capture_status
      : undefined;

  // idempotency
  if (metadataStatus === "captured" && metadataPaymentId === paymentId) {
    console.info("razorpay webhook idempotent captured", medusaOrderId);
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (metadataStatus === "failed" && isFailed) {
    console.info("razorpay webhook idempotent failed", medusaOrderId);
    return NextResponse.json({ ok: true, idempotent: true });
  }

  if (!isCaptured && !isFailed) {
    console.info("razorpay webhook ignored event", event);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Build metadata we will persist
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    razorpay_payment_status: isCaptured ? "captured" : "failed",
    razorpay_payment_id: paymentId,
    razorpay_order_id: razorpayOrderId,
    razorpay_last_event: event,
    razorpay_signature: signature || metadata.razorpay_signature,
    razorpay_amount_minor: razorpayAmountPaise || undefined,
    medusa_total_minor: canonicalMinor || undefined,
    medusa_amount_scale: reconcile.detectedScale || undefined,
    amount_reconcile_matched: reconcile.matched,
    payment_collection_id:
      coerceId(metadata.payment_collection_id) || paymentContext.paymentCollectionId,
    payment_session_id: coerceId(metadata.payment_session_id) || paymentContext.paymentSessionIds[0],
    payment_id: coerceId(metadata.payment_id) || paymentContext.paymentIds[0],
    razorpay_capture_status: isCaptured ? "captured" : prevCaptureStatus,
  };

  // Captured path
  if (isCaptured) {
    try {
      const transactionPayload = {
        amount: canonicalMinor,
        currency_code: currency.toLowerCase?.() || currency,
        reference: coerceId(paymentId) || coerceId(razorpayOrderId) || `razorpay-${medusaOrderId}`,
        provider: "razorpay",
        metadata: {
          razorpay_payment_id: paymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: signature || metadata.razorpay_signature,
          razorpay_event: event,
          razorpay_amount_minor: razorpayAmountPaise || undefined,
          medusa_total_minor: canonicalMinor || undefined,
          medusa_amount_scale: reconcile.detectedScale || undefined,
          amount_reconcile_matched: reconcile.matched,
        },
      };

      const txRes = await registerOrderTransaction(medusaOrderId, transactionPayload);
      const transaction = extractTransaction(txRes.data);
      const transactionId = (transaction?.id as string | undefined) || undefined;
      const metaWithCapture = {
        ...nextMetadata,
        transaction_id: transactionId,
        razorpay_capture_status: txRes?.ok ? "captured" : "failed",
        razorpay_capture_status_code: txRes?.status,
        ...(txRes?.ok
          ? {}
          : {
              razorpay_capture_error:
                extractMessage(txRes?.data) || (txRes?.data ? JSON.stringify(txRes.data) : undefined),
            }),
      };

      // Persist metadata
      await updateOrderMetadata(medusaOrderId, metaWithCapture);

      // Keep Medusa paid totals in sync with Razorpay's captured amount
      if (txRes?.ok) {
        try {
          await setOrderPaidTotal(medusaOrderId, canonicalMinor);
          await setOrderPaymentStatus(medusaOrderId, "captured");
        } catch (err) {
          console.error("failed to update order payment status after capture", {
            medusaOrderId,
            transactionId,
            canonicalMinor,
            err,
          });
          return NextResponse.json({ error: "payment_state_sync_failed" }, { status: 502 });
        }
      }

      if (txRes?.ok) {
        if (order.is_draft_order) {
          try {
            await convertDraftOrder(medusaOrderId);
          } catch (err) {
            console.error("convertDraftOrder failed", err);
          }
        }

        return NextResponse.json({ ok: true, transaction_id: transactionId });
      }

      // If the transaction endpoint is unavailable (404) or the backend rejects, persist metadata and return 200 to avoid Razorpay retries.
      if (txRes?.status === 404) {
        await updateOrderMetadata(medusaOrderId, {
          ...metaWithCapture,
          razorpay_capture_status: "not_supported",
        });
        return NextResponse.json({ ok: false, reason: "transactions_not_supported" });
      }

      console.warn("razorpay webhook transaction failed", {
        medusaOrderId,
        status: txRes?.status,
        data: txRes?.data,
      });

      return NextResponse.json({ error: "transaction_failed" }, { status: 502 });
    } catch (err) {
      console.error("razorpay webhook unexpected error on capture path", err);
      try {
        await updateOrderMetadata(medusaOrderId, {
          ...nextMetadata,
          razorpay_capture_status: "error",
          razorpay_capture_error: String(err),
        });
      } catch (metaErr) {
        console.error("failed to persist metadata after capture error", metaErr);
      }
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  }

  // Failure path (not captured)
  try {
    await updateOrderMetadata(medusaOrderId, nextMetadata);

    if (order.is_draft_order) {
      try {
        await deleteDraftOrder(medusaOrderId);
      } catch (err) {
        console.error("deleteDraftOrder failed", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("razorpay webhook unexpected error on failure path", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
