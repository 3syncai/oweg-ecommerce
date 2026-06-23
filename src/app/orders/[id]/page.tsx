"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function LegacyOrderDetailRedirect() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  useEffect(() => {
    if (!orderId) return;
    const orderNo = searchParams.get("orderNo");
    const query = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : "";
    router.replace(`/account/orders/${encodeURIComponent(orderId)}${query}`);
  }, [orderId, router, searchParams]);

  return null;
}
