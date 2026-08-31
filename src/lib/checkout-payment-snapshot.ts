import { Pool } from "pg";
import { getOrderById, getDraftOrderById, createDraftOrder } from "@/lib/medusa-admin";
import { extractCheckoutOrder } from "@/lib/checkout-order";

export type CheckoutSnapshotLine = {
  variant_id: string;
  quantity: number;
  unit_price?: number;
  title?: string;
};

export type CheckoutSnapshotAddress = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country_code?: string;
};

export type CheckoutPaymentSnapshot = {
  medusa_order_id: string;
  razorpay_order_id?: string | null;
  customer_id?: string | null;
  email?: string | null;
  region_id?: string | null;
  currency_code?: string | null;
  total_rupees?: number | null;
  items: CheckoutSnapshotLine[];
  shipping_address?: CheckoutSnapshotAddress | null;
  billing_address?: CheckoutSnapshotAddress | null;
  metadata?: Record<string, unknown> | null;
  shipping_methods?: Array<Record<string, unknown>> | null;
  created_at?: string;
};

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

async function withEnsureTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkout_payment_snapshot (
      medusa_order_id TEXT PRIMARY KEY,
      razorpay_order_id TEXT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS checkout_payment_snapshot_rzp_idx
      ON checkout_payment_snapshot (razorpay_order_id)
  `);
}

function asAddress(value: unknown): CheckoutSnapshotAddress | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  return {
    first_name: typeof a.first_name === "string" ? a.first_name : undefined,
    last_name: typeof a.last_name === "string" ? a.last_name : undefined,
    phone: typeof a.phone === "string" ? a.phone : undefined,
    address_1: typeof a.address_1 === "string" ? a.address_1 : undefined,
    address_2: typeof a.address_2 === "string" ? a.address_2 : undefined,
    city: typeof a.city === "string" ? a.city : undefined,
    province: typeof a.province === "string" ? a.province : undefined,
    postal_code: typeof a.postal_code === "string" ? a.postal_code : undefined,
    country_code: typeof a.country_code === "string" ? a.country_code : undefined,
  };
}

function extractItems(order: Record<string, unknown>): CheckoutSnapshotLine[] {
  const raw = order.items || order.order_items;
  if (!Array.isArray(raw)) return [];
  const out: CheckoutSnapshotLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const variantId =
      typeof r.variant_id === "string"
        ? r.variant_id
        : typeof (r.variant as { id?: string } | undefined)?.id === "string"
          ? (r.variant as { id: string }).id
          : "";
    if (!variantId) continue;
    const qty = Math.max(1, Number(r.quantity) || 1);
    out.push({
      variant_id: variantId,
      quantity: qty,
      unit_price: typeof r.unit_price === "number" ? r.unit_price : undefined,
      title: typeof r.title === "string" ? r.title : undefined,
    });
  }
  return out;
}

/** Build snapshot from a live Medusa draft/order (admin payload). */
export async function buildCheckoutSnapshotFromOrderId(
  medusaOrderId: string,
  extras?: { razorpay_order_id?: string }
): Promise<CheckoutPaymentSnapshot | null> {
  let order: Record<string, unknown> | null = null;

  // Prefer draft endpoint — /admin/orders often omits email/customer_id for drafts.
  const draftRes = await getDraftOrderById(medusaOrderId);
  if (draftRes.ok && draftRes.data) {
    order = extractCheckoutOrder(draftRes.data) as Record<string, unknown> | null;
  }
  const orderRes = await getOrderById(medusaOrderId);
  const fromOrder =
    orderRes.ok && orderRes.data
      ? (extractCheckoutOrder(orderRes.data) as Record<string, unknown> | null)
      : null;
  if (!order) {
    order = fromOrder;
  } else if (fromOrder) {
    order = {
      ...fromOrder,
      ...order,
      email: order.email || fromOrder.email,
      customer_id: order.customer_id || fromOrder.customer_id,
      items: order.items || fromOrder.items,
      metadata: {
        ...((fromOrder.metadata as Record<string, unknown>) || {}),
        ...((order.metadata as Record<string, unknown>) || {}),
      },
    };
  }

  if (!order) {
    // Fallback: remnant rows after parent DELETE
    return buildSnapshotFromRemnants(medusaOrderId, extras);
  }

  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const items = extractItems(order);
  if (!items.length) {
    const fromDb = await buildSnapshotFromRemnants(medusaOrderId, extras);
    if (fromDb?.items?.length) return fromDb;
  }

  return {
    medusa_order_id: medusaOrderId,
    razorpay_order_id:
      extras?.razorpay_order_id ||
      (typeof metadata.razorpay_order_id === "string" ? metadata.razorpay_order_id : null),
    customer_id: typeof order.customer_id === "string" ? order.customer_id : null,
    email: typeof order.email === "string" ? order.email : null,
    region_id: typeof order.region_id === "string" ? order.region_id : null,
    currency_code: typeof order.currency_code === "string" ? order.currency_code : "inr",
    total_rupees: typeof order.total === "number" ? order.total : null,
    items,
    shipping_address: asAddress(order.shipping_address),
    billing_address: asAddress(order.billing_address) || asAddress(order.shipping_address),
    metadata,
    shipping_methods: Array.isArray(order.shipping_methods)
      ? (order.shipping_methods as Array<Record<string, unknown>>)
      : null,
    created_at: new Date().toISOString(),
  };
}

async function buildSnapshotFromRemnants(
  medusaOrderId: string,
  extras?: { razorpay_order_id?: string }
): Promise<CheckoutPaymentSnapshot | null> {
  const pool = createPool();
  if (!pool) return null;
  try {
    await withEnsureTable(pool);
    const itemsRes = await pool.query(
      `SELECT variant_id, quantity, unit_price, title
       FROM order_item
       WHERE order_id = $1 AND deleted_at IS NULL`,
      [medusaOrderId]
    );
    if (!itemsRes.rows.length) return null;
    const summary = await pool.query(
      `SELECT totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
      [medusaOrderId]
    );
    const totals = (summary.rows[0]?.totals || {}) as Record<string, unknown>;
    return {
      medusa_order_id: medusaOrderId,
      razorpay_order_id: extras?.razorpay_order_id || null,
      customer_id: null,
      email: null,
      region_id: process.env.MEDUSA_REGION_ID || "reg_01KA5SZQ3ZS11Y7HSYJQG16K0K",
      currency_code: "inr",
      total_rupees: Number(totals.current_order_total ?? totals.original_order_total ?? 0) || null,
      items: itemsRes.rows.map((r) => ({
        variant_id: String(r.variant_id),
        quantity: Math.max(1, Number(r.quantity) || 1),
        unit_price: typeof r.unit_price === "number" ? r.unit_price : Number(r.unit_price) || undefined,
        title: typeof r.title === "string" ? r.title : undefined,
      })),
      shipping_address: null,
      billing_address: null,
      metadata: {
        recovered_from_remnants: true,
        original_medusa_order_id: medusaOrderId,
      },
      shipping_methods: null,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("buildSnapshotFromRemnants failed", err);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function saveCheckoutPaymentSnapshot(
  snapshot: CheckoutPaymentSnapshot
): Promise<{ ok: boolean; error?: string }> {
  const pool = createPool();
  if (!pool) return { ok: false, error: "DATABASE_URL missing" };
  try {
    await withEnsureTable(pool);
    await pool.query(
      `INSERT INTO checkout_payment_snapshot (medusa_order_id, razorpay_order_id, payload, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (medusa_order_id) DO UPDATE SET
         razorpay_order_id = EXCLUDED.razorpay_order_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        snapshot.medusa_order_id,
        snapshot.razorpay_order_id || null,
        JSON.stringify(snapshot),
      ]
    );
    return { ok: true };
  } catch (err) {
    console.error("saveCheckoutPaymentSnapshot failed", err);
    return { ok: false, error: String(err) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function loadCheckoutPaymentSnapshot(
  medusaOrderId: string
): Promise<CheckoutPaymentSnapshot | null> {
  const pool = createPool();
  if (!pool || !medusaOrderId) return null;
  try {
    await withEnsureTable(pool);
    const res = await pool.query(
      `SELECT payload FROM checkout_payment_snapshot WHERE medusa_order_id = $1 LIMIT 1`,
      [medusaOrderId]
    );
    const payload = res.rows[0]?.payload;
    if (!payload || typeof payload !== "object") return null;
    return payload as CheckoutPaymentSnapshot;
  } catch (err) {
    console.warn("loadCheckoutPaymentSnapshot failed", err);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function loadCheckoutPaymentSnapshotByRazorpayOrderId(
  razorpayOrderId: string
): Promise<CheckoutPaymentSnapshot | null> {
  const pool = createPool();
  if (!pool || !razorpayOrderId) return null;
  try {
    await withEnsureTable(pool);
    const res = await pool.query(
      `SELECT payload FROM checkout_payment_snapshot WHERE razorpay_order_id = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [razorpayOrderId]
    );
    const payload = res.rows[0]?.payload;
    if (!payload || typeof payload !== "object") return null;
    return payload as CheckoutPaymentSnapshot;
  } catch (err) {
    console.warn("loadCheckoutPaymentSnapshotByRazorpayOrderId failed", err);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Recreate a Medusa draft from snapshot when the original parent row was deleted.
 * Returns the new draft/order id.
 */
export async function recreateDraftFromCheckoutSnapshot(
  snapshot: CheckoutPaymentSnapshot
): Promise<{ orderId: string } | null> {
  if (!snapshot.items?.length) return null;

  const regionId =
    snapshot.region_id ||
    process.env.MEDUSA_REGION_ID ||
    "reg_01KA5SZQ3ZS11Y7HSYJQG16K0K";

  const shippingOptionId =
    process.env.MEDUSA_SHIPPING_OPTION_ID || "so_01KBR9WKS1KWPFG3XW23WCG0N7";

  const rawMeta = (snapshot.metadata || {}) as Record<string, unknown>;
  const safeMetaKeys = [
    "payment_method",
    "mode",
    "cart_id",
    "referral_code",
    "coin_discount_code",
    "coin_discount_minor",
    "coin_discount_rupees",
    "coins_discounted",
    "oweg10_code",
    "oweg10_discount_minor",
    "oweg10_discount_rupees",
    "oweg10_customer_id",
    "promo_code",
    "promo_discount_rupees",
    "promo_discount_minor",
    "promo_promotion_id",
    "buy_now",
  ];
  const prunedMeta: Record<string, unknown> = {};
  for (const k of safeMetaKeys) {
    if (rawMeta[k] !== undefined) prunedMeta[k] = rawMeta[k];
  }

  const meta = {
    ...prunedMeta,
    recovered_from_snapshot: true,
    original_medusa_order_id: snapshot.medusa_order_id,
    razorpay_order_id: snapshot.razorpay_order_id || undefined,
    checkout_convert_authorized: true,
    checkout_convert_authorized_at: new Date().toISOString(),
    checkout_status: "awaiting_payment",
    checkout_tombstone: false,
    checkout_payment_failed: false,
    payment_method: "razorpay",
  };

  const email =
    (typeof snapshot.email === "string" && snapshot.email.trim()) ||
    `recover+${snapshot.medusa_order_id.slice(-10)}@oweg.local`;

  const payload: Record<string, unknown> = {
    region_id: regionId,
    email,
    currency_code: (snapshot.currency_code || "inr").toLowerCase(),
    items: snapshot.items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
      ...(typeof i.unit_price === "number" ? { unit_price: i.unit_price } : {}),
    })),
    metadata: meta,
    shipping_methods: [
      {
        shipping_option_id: shippingOptionId,
        option_id: shippingOptionId,
        amount: 0,
        price: 0,
        name: "Recovered shipping",
        data: { recovered_from_snapshot: true },
      },
    ],
  };

  if (snapshot.customer_id) payload.customer_id = snapshot.customer_id;
  if (snapshot.shipping_address) {
    payload.shipping_address = {
      ...snapshot.shipping_address,
      first_name: snapshot.shipping_address.first_name || "Customer",
      last_name: snapshot.shipping_address.last_name || "Recover",
      country_code: snapshot.shipping_address.country_code || "in",
    };
  }
  if (snapshot.billing_address) {
    payload.billing_address = {
      ...snapshot.billing_address,
      first_name: snapshot.billing_address.first_name || "Customer",
      last_name: snapshot.billing_address.last_name || "Recover",
      country_code: snapshot.billing_address.country_code || "in",
    };
  } else if (payload.shipping_address) {
    payload.billing_address = payload.shipping_address;
  }

  const created = await createDraftOrder(payload);
  if (!created.ok || !created.data) {
    console.error("recreateDraftFromCheckoutSnapshot failed", created.status, created.data);
    return null;
  }
  const order = extractCheckoutOrder(created.data);
  if (!order?.id) return null;

  // Keep snapshot reachable under both old and new ids
  await saveCheckoutPaymentSnapshot({
    ...snapshot,
    medusa_order_id: order.id,
    metadata: {
      ...meta,
      rebuilt_medusa_order_id: order.id,
    },
  });

  // Point the ORIGINAL snapshot row at the rebuilt order so concurrent recovers short-circuit.
  if (snapshot.medusa_order_id && snapshot.medusa_order_id !== order.id) {
    await saveCheckoutPaymentSnapshot({
      ...snapshot,
      medusa_order_id: snapshot.medusa_order_id,
      metadata: {
        ...(snapshot.metadata || {}),
        rebuilt_medusa_order_id: order.id,
      },
    });
  }

  return { orderId: order.id };
}

/** Snapshot helper used at RZP mint time. */
export async function persistSnapshotForCheckout(
  medusaOrderId: string,
  razorpayOrderId?: string
): Promise<void> {
  try {
    const snap = await buildCheckoutSnapshotFromOrderId(medusaOrderId, {
      razorpay_order_id: razorpayOrderId,
    });
    if (!snap || !snap.items.length) {
      console.warn("persistSnapshotForCheckout: empty snapshot", medusaOrderId);
      return;
    }
    const saved = await saveCheckoutPaymentSnapshot(snap);
    if (!saved.ok) console.warn("persistSnapshotForCheckout save failed", saved.error);
  } catch (err) {
    console.warn("persistSnapshotForCheckout error", err);
  }
}
