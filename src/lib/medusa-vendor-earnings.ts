/**
 * Storefront bridge to Medusa vendor-earnings (no local ledger duplicate).
 */

import { getMedusaAdminApiKey } from "@/lib/storefront-db"

function backendUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(/\/$/, "")
}

function adminAuthHeader() {
  return `Basic ${Buffer.from(`${getMedusaAdminApiKey()}:`).toString("base64")}`
}

export async function scheduleVendorEarningsOnDelivery(
  orderId: string,
  _pool?: unknown,
  options?: { deliveredAt?: Date; vendorIds?: string[] }
) {
  const res = await fetch(
    `${backendUrl()}/admin/vendor-earnings/schedule-delivery`,
    {
      method: "POST",
      headers: {
        Authorization: adminAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: orderId,
        delivered_at: options?.deliveredAt?.toISOString(),
        vendor_ids: options?.vendorIds,
      }),
      cache: "no-store",
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ||
        `Medusa schedule-delivery failed (${res.status})`
    )
  }
  return (data as { result?: unknown }).result ?? data
}
