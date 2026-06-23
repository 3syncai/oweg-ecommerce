"use client";

import { useParams, useSearchParams } from "next/navigation";
import OrderDetailContent from "@/components/orders/OrderDetailContent";

export default function AccountOrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const orderNoRaw = searchParams.get("orderNo");
  const parsedOrderNo = Number(orderNoRaw);
  const orderNumber =
    Number.isFinite(parsedOrderNo) && parsedOrderNo > 0 ? Math.floor(parsedOrderNo) : null;
  const initialAction = searchParams.get("action");

  if (!orderId) return null;

  return (
    <OrderDetailContent
      orderId={orderId}
      orderNumber={orderNumber}
      initialAction={initialAction === "cancel" || initialAction === "return" ? initialAction : null}
    />
  );
}
