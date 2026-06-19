import { cartLineAmountRupees } from "@/lib/cart-helpers";
import { getPool } from "@/lib/wallet-ledger";

export type OrderDisplayTotals = {
  itemsSubtotal: number;
  shipping: number;
  coinDiscount: number;
  oweg10Discount: number;
  grandTotal: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readSummaryAmount(order: Record<string, unknown>, key: string): number {
  const summary = order.summary as Record<string, unknown> | undefined;
  if (!summary) return 0;

  const direct = toNumber(summary[key]);
  if (direct > 0) return direct;

  const totals = summary.totals as Record<string, unknown> | undefined;
  return toNumber(totals?.[key]);
}

export async function enrichOrderWithSummaryTotals(
  order: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orderId = typeof order.id === "string" ? order.id : undefined;
  if (!orderId || !process.env.DATABASE_URL) return order;

  try {
    const pool = getPool();
    const summaryRes = await pool.query(
      `SELECT totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    const totals = summaryRes.rows[0]?.totals as Record<string, unknown> | undefined;
    if (!totals || typeof totals !== "object") return order;

    const orderRes = await pool.query(
      `SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const dbMetadata = (orderRes.rows[0]?.metadata || {}) as Record<string, unknown>;

    return {
      ...order,
      metadata: {
        ...(typeof order.metadata === "object" && order.metadata !== null
          ? (order.metadata as Record<string, unknown>)
          : {}),
        ...dbMetadata,
      },
      summary: {
        ...(typeof order.summary === "object" && order.summary !== null
          ? (order.summary as Record<string, unknown>)
          : {}),
        totals,
        ...totals,
      },
    };
  } catch {
    return order;
  }
}

export async function enrichOrdersWithSummaryTotals(
  orders: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!orders.length || !process.env.DATABASE_URL) return orders;

  const orderIds = orders
    .map((order) => (typeof order.id === "string" ? order.id : undefined))
    .filter((id): id is string => Boolean(id));
  if (!orderIds.length) return orders;

  try {
    const pool = getPool();
    const [summaryRes, orderRes] = await Promise.all([
      pool.query(`SELECT order_id, totals FROM order_summary WHERE order_id = ANY($1::text[])`, [
        orderIds,
      ]),
      pool.query(`SELECT id, metadata FROM "order" WHERE id = ANY($1::text[])`, [orderIds]),
    ]);

    const summaryByOrderId = new Map<string, Record<string, unknown>>();
    for (const row of summaryRes.rows) {
      if (row.totals && typeof row.totals === "object") {
        summaryByOrderId.set(String(row.order_id), row.totals as Record<string, unknown>);
      }
    }

    const metadataByOrderId = new Map<string, Record<string, unknown>>();
    for (const row of orderRes.rows) {
      metadataByOrderId.set(String(row.id), (row.metadata || {}) as Record<string, unknown>);
    }

    return orders.map((order) => {
      const orderId = typeof order.id === "string" ? order.id : undefined;
      if (!orderId) return order;

      const totals = summaryByOrderId.get(orderId);
      const dbMetadata = metadataByOrderId.get(orderId);
      if (!totals && !dbMetadata) return order;

      return {
        ...order,
        metadata: {
          ...(typeof order.metadata === "object" && order.metadata !== null
            ? (order.metadata as Record<string, unknown>)
            : {}),
          ...(dbMetadata || {}),
        },
        ...(totals
          ? {
              summary: {
                ...(typeof order.summary === "object" && order.summary !== null
                  ? (order.summary as Record<string, unknown>)
                  : {}),
                totals,
                ...totals,
              },
            }
          : {}),
      };
    });
  } catch {
    return orders;
  }
}

export function normalizeOrderForCustomer(order: Record<string, unknown>): Record<string, unknown> {
  const metadata = (order.metadata && typeof order.metadata === "object"
    ? order.metadata
    : {}) as Record<string, unknown>;

  const currency =
    typeof order.currency_code === "string" ? order.currency_code : undefined;
  const seenItemIds = new Set<string>();

  const items = Array.isArray(order.items)
    ? order.items
        .map((item) => {
          const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          const lineTotal = resolveOrderLineAmount(record, currency);
          const quantity = Math.max(1, Number(record.quantity) || 1);
          const itemId = record.id != null ? String(record.id) : "";
          return {
            id: record.id,
            title: (record.title as string) || (record.product_title as string),
            quantity: record.quantity,
            unit_price: lineTotal / quantity,
            total: lineTotal,
            thumbnail: (record.thumbnail as string) || (record.image_url as string),
            _itemId: itemId,
          };
        })
        .filter((item) => {
          const id = item._itemId;
          if (!id) return true;
          if (seenItemIds.has(id)) return false;
          seenItemIds.add(id);
          return true;
        })
        .map(({ _itemId, ...item }) => item)
    : Array.isArray(order.items)
      ? order.items
      : [];

  const displayTotals = resolveOrderDisplayTotals(order);
  const payment_status = formatOrderPaymentStatus(order);

  return {
    ...order,
    total: displayTotals.grandTotal,
    subtotal: displayTotals.itemsSubtotal,
    shipping_total: displayTotals.shipping,
    payment_status,
    fulfillment_status: formatOrderFulfillmentStatus(
      typeof order.fulfillment_status === "string" ? order.fulfillment_status : undefined
    ),
    items,
    metadata,
    display_totals: displayTotals,
  };
}

export function resolveOrderLineAmount(
  item: Record<string, unknown>,
  currencyCode?: string
): number {
  const qty = Math.max(1, toNumber(item.quantity) || 1);
  const unitPrice = toNumber(item.unit_price);

  // Medusa order line items are stored in rupees for this project (e.g. 432).
  if (unitPrice > 0 && unitPrice < 10000) {
    return unitPrice * qty;
  }

  return cartLineAmountRupees(item, currencyCode);
}

export function resolveOrderDisplayTotals(order: Record<string, unknown>): OrderDisplayTotals {
  const metadata = (order.metadata && typeof order.metadata === "object"
    ? order.metadata
    : {}) as Record<string, unknown>;
  const currency = typeof order.currency_code === "string" ? order.currency_code : "INR";

  const items = Array.isArray(order.items) ? order.items : [];
  let itemsSubtotal = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    itemsSubtotal += resolveOrderLineAmount(item as Record<string, unknown>, currency);
  }

  const coinDiscount =
    toNumber(metadata.coin_discount_rupees) || toNumber(metadata.coins_discounted);
  const oweg10Discount = toNumber(metadata.oweg10_discount_rupees);

  const summaryTotal =
    readSummaryAmount(order, "current_order_total") ||
    readSummaryAmount(order, "original_order_total") ||
    readSummaryAmount(order, "accounting_total");

  const shippingFromMetadata = toNumber(metadata.expected_shipping_price);
  const rawTotal = toNumber(order.total);

  let grandTotal = summaryTotal;
  if (!grandTotal && itemsSubtotal > 0) {
    grandTotal = Math.max(0, itemsSubtotal + shippingFromMetadata - coinDiscount - oweg10Discount);
  }
  if (!grandTotal && rawTotal > 0 && (summaryTotal > 0 || rawTotal >= itemsSubtotal * 0.5)) {
    grandTotal = rawTotal;
  }
  if (summaryTotal > 0) {
    grandTotal = summaryTotal;
  } else if (grandTotal > 0 && rawTotal > 0 && rawTotal < grandTotal * 0.5) {
    // Ignore store pending_difference masquerading as order.total.
  }

  let shipping = shippingFromMetadata;
  if (shipping <= 0 && grandTotal > 0 && itemsSubtotal > 0) {
    shipping = Math.max(0, grandTotal - itemsSubtotal + coinDiscount + oweg10Discount);
  }
  if (shipping <= 0) {
    shipping = toNumber(order.shipping_total);
  }

  return {
    itemsSubtotal,
    shipping,
    coinDiscount,
    oweg10Discount,
    grandTotal,
  };
}

export function formatOrderPaymentStatus(order: Record<string, unknown>): string {
  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  const payment = typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : "";

  if (razorpayStatus === "captured" || payment === "captured" || payment === "paid") return "Paid";
  if (payment === "partially_captured") return "Partially paid";
  if (payment === "refunded" || payment === "partially_refunded") return "Refunded";
  if (payment === "canceled" || payment === "cancelled") return "Cancelled";
  if (payment === "awaiting" || payment === "pending" || payment === "not_paid") return "Pending";
  return payment.replace(/_/g, " ") || "Pending";
}

export function formatOrderFulfillmentStatus(status?: string): string {
  const value = (status || "processing").toLowerCase();
  if (value === "not_fulfilled") return "Not fulfilled";
  if (value === "partially_fulfilled") return "Partially fulfilled";
  return value.replace(/_/g, " ");
}
