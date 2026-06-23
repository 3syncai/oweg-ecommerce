import Image from "next/image";

export type OrderDetailsIconName =
  | "addresses"
  | "back-to-orders"
  | "buy-again"
  | "cancel-order"
  | "change"
  | "contact-support"
  | "copy-id"
  | "delivery-address"
  | "delivery-partner"
  | "download-invoice"
  | "help-support"
  | "my-account"
  | "open-in-maps"
  | "order-placed-calendar"
  | "order-status"
  | "orders"
  | "payment-cod"
  | "payment-methods"
  | "preferences"
  | "price-summary"
  | "product-item"
  | "return-replace"
  | "safe-secure-shield"
  | "sign-out"
  | "status-delivered"
  | "status-order-placed"
  | "status-processing"
  | "status-shipped"
  | "total-amount"
  | "track-order"
  | "wishlist";

type OrderDetailsIconProps = {
  name: OrderDetailsIconName;
  className?: string;
  size?: number;
};

export default function OrderDetailsIcon({
  name,
  className = "h-5 w-5",
  size = 20,
}: OrderDetailsIconProps) {
  return (
    <Image
      src={`/icons/order-details/${name}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}

export function getOrderPaymentIconName(order?: {
  metadata?: Record<string, unknown>;
  payment_status?: string;
} | null): OrderDetailsIconName {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const method = typeof meta.payment_method === "string" ? meta.payment_method.toLowerCase() : "";
  const payment = (order?.payment_status || "").toLowerCase();
  return method === "cod" || payment === "cod" ? "payment-cod" : "payment-methods";
}
