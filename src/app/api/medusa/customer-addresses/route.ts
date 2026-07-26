import { NextRequest, NextResponse } from "next/server";
import { findMatchingCustomerAddress } from "@/lib/customer-address-dedupe";
import { withDerivedAddressName } from "@/lib/customer-address-name";
import { medusaStoreFetch } from "@/lib/medusa-auth";

type StoreAddress = {
  id: string;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

function extractAddresses(data: unknown): StoreAddress[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const list =
    (Array.isArray(record.addresses) && record.addresses) ||
    (record.customer &&
      typeof record.customer === "object" &&
      Array.isArray((record.customer as { addresses?: unknown }).addresses) &&
      (record.customer as { addresses: StoreAddress[] }).addresses) ||
    [];
  return (list as StoreAddress[]).filter((a) => Boolean(a?.id));
}

export async function GET(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ addresses: [] }, { status: 200 });
  }

  try {
    const res = await medusaStoreFetch("/store/customers/me/addresses", {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Unable to load addresses" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error loading addresses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload =
    body && typeof body === "object"
      ? withDerivedAddressName(body as Record<string, unknown>)
      : body;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid address payload" }, { status: 400 });
  }

  const addressPayload = payload as Record<string, unknown>;

  try {
    // Upsert: update an existing matching address instead of creating a duplicate
    const listRes = await medusaStoreFetch("/store/customers/me/addresses", {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = extractAddresses(listData);
      const match = findMatchingCustomerAddress(existing, {
        address_1: typeof addressPayload.address_1 === "string" ? addressPayload.address_1 : null,
        address_2: typeof addressPayload.address_2 === "string" ? addressPayload.address_2 : null,
        city: typeof addressPayload.city === "string" ? addressPayload.city : null,
        postal_code:
          typeof addressPayload.postal_code === "string" ? addressPayload.postal_code : null,
        country_code:
          typeof addressPayload.country_code === "string" ? addressPayload.country_code : null,
      });

      if (match?.id) {
        const updateRes = await medusaStoreFetch(
          `/store/customers/me/addresses/${encodeURIComponent(match.id)}`,
          {
            method: "POST",
            forwardedCookie,
            headers: { Cookie: forwardedCookie },
            body: JSON.stringify(addressPayload),
          }
        );

        if (!updateRes.ok) {
          const text = await updateRes.text();
          return NextResponse.json(
            { error: text || "Unable to update matching address" },
            { status: updateRes.status }
          );
        }

        const data = await updateRes.json();
        return NextResponse.json(data);
      }
    }

    const res = await medusaStoreFetch("/store/customers/me/addresses", {
      method: "POST",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
      body: JSON.stringify(addressPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Unable to save address" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error saving address" }, { status: 500 });
  }
}
