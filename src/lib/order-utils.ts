import type { OrderAddress, OrderDetail } from "@/lib/order-types";

export function sanitizeTextInput(value: string, maxLength: number) {
  const withoutControlChars = [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return (code >= 32 && code !== 127) || ch === "\n" || ch === "\t";
    })
    .join("");

  return withoutControlChars
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

export const formatOrderDateTime = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatOrderDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const formatOrderCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  const code = (currency || "INR").toUpperCase();
  const isInr = code === "INR";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: code,
    ...(isInr ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
  }).format(value);
};

export function formatShippingAddress(address?: OrderAddress): string {
  if (!address) return "";
  const parts = [
    address.address_1,
    address.address_2,
    address.city,
    address.province,
    address.postal_code,
    address.country_code?.toUpperCase(),
  ].filter(Boolean);
  return parts.join(", ");
}

export function getGoogleMapsUrl(address?: OrderAddress): string {
  const query = formatShippingAddress(address);
  if (!query) return "https://maps.google.com";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function getOrderDisplayLabel(order?: OrderDetail | null, orderNumber?: number | null) {
  if (orderNumber != null) return `#${orderNumber}`;
  if (order?.display_id != null) return `#${order.display_id}`;
  if (order?.id) return `#${order.id.slice(-6)}`;
  return "#—";
}

export function getPaymentMethodLabel(order?: OrderDetail | null): string {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const method = typeof meta.payment_method === "string" ? meta.payment_method.toLowerCase() : "";
  const payment = (order?.payment_status || "").toLowerCase();
  const paid = payment === "captured" || payment === "paid" || meta.razorpay_payment_status === "captured";

  if (method === "cod") return paid ? "Cash on Delivery" : "Cash on Delivery (Pending)";
  if (method === "upi") return paid ? "UPI - Paid" : "UPI - Pending";
  if (method === "card") return paid ? "Card - Paid" : "Card - Pending";
  if (paid) return "Paid online";
  return order?.payment_status || "Pending";
}

export function getShiprocketAwb(order?: OrderDetail | null): string | null {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  return typeof meta.shiprocket_awb === "string" && meta.shiprocket_awb
    ? meta.shiprocket_awb
    : null;
}

export function getShiprocketStatus(order?: OrderDetail | null): string {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  return typeof meta.shiprocket_status === "string" ? meta.shiprocket_status.toLowerCase() : "";
}

export function buildOrderHref(orderId: string, displayId?: number | null) {
  const base = `/account/orders/${encodeURIComponent(orderId)}`;
  if (displayId != null) return `${base}?orderNo=${displayId}`;
  return base;
}

export function buildTrackHref(orderId: string, displayId?: number | null) {
  const base = `/account/orders/${encodeURIComponent(orderId)}/track`;
  if (displayId != null) return `${base}?orderNo=${displayId}`;
  return base;
}

export function isPaymentPending(order?: OrderDetail | null): boolean {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const payment = (order?.payment_status || "").toLowerCase();
  const paid =
    payment === "captured" ||
    payment === "paid" ||
    meta.razorpay_payment_status === "captured";
  if (paid) return false;
  const method = typeof meta.payment_method === "string" ? meta.payment_method.toLowerCase() : "";
  if (method === "cod" || payment === "cod") return true;
  return ["not_paid", "awaiting", "requires_action", "pending"].includes(payment);
}

export function getPaymentMethodDisplayName(order?: OrderDetail | null): string {
  return getPaymentMethodLabel(order).replace(/\s*\(Pending\)\s*$/i, "").trim();
}

export type OrderLineItemForCart = {
  variant_id: string;
  quantity: number;
};

export function resolveOrderLineItemsForCart(order?: OrderDetail | null): OrderLineItemForCart[] {
  if (!order) return [];

  const fromItems = (order.items || [])
    .filter((item) => item.variant_id)
    .map((item) => ({
      variant_id: item.variant_id as string,
      quantity: Math.max(1, item.quantity || 1),
    }));

  if (fromItems.length) return fromItems;

  const meta = (order.metadata || {}) as Record<string, unknown>;
  const lineItems = meta.line_items;
  if (Array.isArray(lineItems)) {
    const parsed: OrderLineItemForCart[] = [];
    for (const entry of lineItems) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.variant_id === "string" && record.variant_id) {
        parsed.push({
          variant_id: record.variant_id,
          quantity: Math.max(1, typeof record.quantity === "number" ? record.quantity : 1),
        });
      }
    }
    if (parsed.length) return parsed;
  }

  const metaVariants = meta.variant_ids;
  if (Array.isArray(metaVariants)) {
    return metaVariants
      .filter((id): id is string => typeof id === "string" && Boolean(id))
      .map((variant_id) => ({ variant_id, quantity: 1 }));
  }

  if (typeof meta.variant_id === "string" && meta.variant_id) {
    return [{ variant_id: meta.variant_id, quantity: 1 }];
  }

  return [];
}
