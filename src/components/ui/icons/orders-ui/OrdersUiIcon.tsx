import Image from "next/image";

export type OrdersUiIconName =
  | "copy-order-id"
  | "arrow-right"
  | "contact-support"
  | "order-placed"
  | "payment-confirmed"
  | "package-processing"
  | "shipped-truck"
  | "delivered-check"
  | "out-for-delivery"
  | "estimated-delivery"
  | "live-tracking"
  | "cancel-order"
  | "return-replace"
  | "download-invoice"
  | "track-order"
  | "view-details"
  | "change-address"
  | "delivery-partner"
  | "map-pin"
  | "return-window"
  | "cancelled-status"
  | "buy-again"
  | "refresh"
  | "search"
  | "filter"
  | "all-orders"
  | "processing-status"
  | "shipped-status"
  | "delivered-status";

type OrdersUiIconProps = {
  name: OrdersUiIconName;
  className?: string;
  size?: number;
};

export default function OrdersUiIcon({
  name,
  className = "h-5 w-5",
  size = 20,
}: OrdersUiIconProps) {
  return (
    <Image
      src={`/icons/orders-ui/${name}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}
