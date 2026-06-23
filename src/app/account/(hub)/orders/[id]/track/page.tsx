"use client";

import { useParams, useSearchParams } from "next/navigation";
import TrackOrderContent from "@/components/orders/TrackOrderContent";

export default function AccountTrackOrderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const orderNoRaw = searchParams.get("orderNo");
  const parsedOrderNo = Number(orderNoRaw);
  const orderNumber =
    Number.isFinite(parsedOrderNo) && parsedOrderNo > 0 ? Math.floor(parsedOrderNo) : null;

  if (!orderId) return null;

  return <TrackOrderContent orderId={orderId} orderNumber={orderNumber} />;
}
