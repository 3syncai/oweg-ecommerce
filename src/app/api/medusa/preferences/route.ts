import { NextRequest, NextResponse } from "next/server";
import {
  appendUpstreamCookies,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth";
import {
  hasAnyPreferences,
  normalizePreferences,
  type PreferenceProfile,
} from "@/lib/personalization";

export const dynamic = "force-dynamic";

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload;
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error) return payload.error;
    if (typeof payload.message === "string" && payload.message) return payload.message;
  }
  return fallback;
}

function extractPreferences(metadata?: Record<string, unknown> | null) {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).preferences;
  return normalizePreferences(raw);
}

async function fetchCustomer(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  const forwardedHeaders = {
    origin: req.headers.get("origin") ?? undefined,
    referer: req.headers.get("referer") ?? undefined,
    "user-agent": req.headers.get("user-agent") ?? undefined,
  };
  if (!forwardedCookie) {
    return { customer: null, status: 401 as const, preferences: null };
  }

  const meRes = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie,
    forwardedHeaders,
  });

  if (!meRes.ok) {
    return {
      customer: null,
      status: meRes.status === 401 ? 401 : meRes.status,
      preferences: null,
      error: await extractErrorPayload(meRes),
    };
  }

  const payload = await meRes.json();
  const customer = payload?.customer || payload;
  const preferences = extractPreferences(customer?.metadata as Record<string, unknown> | undefined);
  return { customer, preferences, status: 200 as const, upstream: meRes };
}

export async function GET(req: NextRequest) {
  try {
    const result = await fetchCustomer(req);
    if (result.status !== 200) {
      if (result.status === 401) {
        return NextResponse.json({ preferences: null, customer: null }, { status: 401 });
      }
      const message = toErrorMessage(result.error, "Unable to load preferences.");
      return NextResponse.json({ error: message }, { status: result.status });
    }
    const response = NextResponse.json(
      { preferences: result.preferences ?? null, customer: result.customer ?? null },
      { status: 200 }
    );
    if (result.upstream) {
      appendUpstreamCookies(response, result.upstream);
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load preferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined;
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    };
    if (!forwardedCookie) {
      return NextResponse.json({ error: "Please sign in to personalize your feed." }, { status: 401 });
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as { preferences?: PreferenceProfile };
    const incoming = normalizePreferences(body.preferences ?? body);
    const timestamp = new Date().toISOString();

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    });

    if (!meRes.ok) {
      const payload = await extractErrorPayload(meRes);
      const message = toErrorMessage(payload, "Unable to verify your account.");
      const status = meRes.status === 401 ? 401 : meRes.status;
      return NextResponse.json({ error: message }, { status });
    }

    const mePayload = await meRes.json();
    const customer = mePayload?.customer || mePayload;
    const existingMetadata =
      (customer?.metadata && typeof customer.metadata === "object" ? (customer.metadata as Record<string, unknown>) : {}) || {};
    const existingPrefs = extractPreferences(existingMetadata) ?? { categories: [], productTypes: [], brands: [] };

    const nextPreferences: PreferenceProfile = {
      categories: incoming?.categories ?? existingPrefs.categories,
      productTypes: incoming?.productTypes ?? existingPrefs.productTypes,
      brands: incoming?.brands ?? existingPrefs.brands,
      lastUpdated: timestamp,
      version: typeof existingPrefs.version === "number" ? existingPrefs.version + 1 : 1,
    };

    const updateRes = await medusaStoreFetch("/store/customers/me", {
      method: "POST",
      forwardedCookie,
      forwardedHeaders,
      body: JSON.stringify({
        metadata: {
          ...existingMetadata,
          preferences: nextPreferences,
        },
      }),
    });

    if (!updateRes.ok) {
      const payload = await extractErrorPayload(updateRes);
      const message = toErrorMessage(payload, "Unable to save preferences right now.");
      return NextResponse.json({ error: message }, { status: updateRes.status });
    }

    const updatedPayload = await updateRes.json().catch(() => ({}));
    const updatedCustomer = updatedPayload?.customer || updatedPayload || customer;
    const response = NextResponse.json(
      {
        preferences: nextPreferences,
        customer: hasAnyPreferences(nextPreferences) ? { ...updatedCustomer, metadata: { ...(updatedCustomer?.metadata || {}), preferences: nextPreferences } } : updatedCustomer,
      },
      { status: 200 }
    );
    appendUpstreamCookies(response, updateRes);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to save preferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
