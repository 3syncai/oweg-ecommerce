import { NextRequest, NextResponse } from "next/server";
import {
  fetchProductsByCategoryId,
  fetchProductsByTag,
  fetchProductsByType,
  findCategoryByTitleOrHandle,
  toUiProduct,
  type MedusaProduct,
} from "@/lib/medusa";
// MySQL import removed - using Medusa prices only
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

type SourceKind = "category" | "type" | "brand";

type SourceConfig = {
  kind: SourceKind;
  label: string;
  priority: number;
};

type ProductHit = {
  product: MedusaProduct;
  score: number;
  sourceTag?: string;
  sourceCategoryId?: string;
  sourceCategoryHandle?: string;
};

// PriceOverride type removed - using Medusa prices only

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload;
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error) return payload.error;
    if (typeof payload.message === "string" && payload.message) return payload.message;
  }
  return fallback;
}

async function fetchCustomerPreferences(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  const forwardedHeaders = {
    origin: req.headers.get("origin") ?? undefined,
    referer: req.headers.get("referer") ?? undefined,
    "user-agent": req.headers.get("user-agent") ?? undefined,
  };

  if (!forwardedCookie) return { preferences: null, customer: null, status: 401 as const };

  const meRes = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie,
    forwardedHeaders,
  });

  if (!meRes.ok) {
    return {
      preferences: null,
      customer: null,
      status: meRes.status === 401 ? 401 : meRes.status,
      error: await extractErrorPayload(meRes),
    };
  }

  const payload = await meRes.json();
  const customer = payload?.customer || payload;
  const metadata = (customer?.metadata || {}) as Record<string, unknown>;
  const preferences = normalizePreferences(metadata?.preferences);
  return { preferences, customer, status: 200 as const, upstream: meRes };
}

function buildSources(preferences: PreferenceProfile | null | undefined): SourceConfig[] {
  if (!preferences) return [];
  const sources: SourceConfig[] = [];
  preferences.categories.forEach((label, idx) =>
    sources.push({ kind: "category", label, priority: 300 - idx })
  );
  preferences.productTypes.forEach((label, idx) =>
    sources.push({ kind: "type", label, priority: 200 - idx })
  );
  preferences.brands.forEach((label, idx) =>
    sources.push({ kind: "brand", label, priority: 100 - idx })
  );
  return sources;
}

function dedupeAndScore(items: ProductHit[]) {
  const map = new Map<string, ProductHit>();
  items.forEach((hit) => {
    if (!hit?.product?.id) return;
    const key = hit.product.id;
    const existing = map.get(key);
    if (!existing || hit.score > existing.score) {
      map.set(key, hit);
    }
  });
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || 24)));
    const perSourceLimit = Math.max(pageSize * 2, 40);

    const prefsResult = await fetchCustomerPreferences(req);
    if (prefsResult.status !== 200) {
      if (prefsResult.status === 401) {
        return NextResponse.json({ error: "Please sign in.", products: [] }, { status: 401 });
      }
      const message = toErrorMessage(prefsResult.error, "Unable to load personalized products.");
      return NextResponse.json({ error: message }, { status: prefsResult.status });
    }

    const preferences = prefsResult.preferences;
    if (!hasAnyPreferences(preferences)) {
      return NextResponse.json(
        { preferences: preferences ?? { categories: [], productTypes: [], brands: [] }, products: [], total: 0, page, pageSize },
        { status: 200 }
      );
    }

    const sources = buildSources(preferences);
    const hits: ProductHit[] = [];

    for (const source of sources) {
      try {
        let products: MedusaProduct[] = [];
        let sourceCategoryId: string | undefined;
        let sourceCategoryHandle: string | undefined;

        if (source.kind === "category") {
          const category = await findCategoryByTitleOrHandle(source.label);
          if (category?.id) {
            sourceCategoryId = category.id;
            sourceCategoryHandle = category.handle;
            products = await fetchProductsByCategoryId(category.id, perSourceLimit);
          }
          if (!products?.length) {
            products = await fetchProductsByTag(source.label, perSourceLimit);
          }
        } else if (source.kind === "type") {
          products = await fetchProductsByType(source.label, perSourceLimit);
          if (!products?.length) {
            products = await fetchProductsByTag(source.label, perSourceLimit);
          }
        } else {
          products = await fetchProductsByTag(source.label, perSourceLimit);
        }

        products.forEach((product, idx) => {
          const scoreBoost = source.priority;
          const recencyBonus = Math.max(0, perSourceLimit - idx);
          hits.push({
            product,
            score: scoreBoost + recencyBonus * 0.01,
            sourceTag: `${source.kind}:${source.label}`,
            sourceCategoryId,
            sourceCategoryHandle,
          });
        });
      } catch (err) {
        console.warn("personalized/products: failed source", source.label, err);
      }
    }

    const deduped = dedupeAndScore(hits);
    const start = (page - 1) * pageSize;
    const slice = deduped.slice(start, start + pageSize).map((hit) => {
      const ui = toUiProduct(hit.product);
      return {
        ...ui,
        sourceTag: hit.sourceTag,
        sourceCategoryId: hit.sourceCategoryId,
        sourceCategoryHandle: hit.sourceCategoryHandle,
      };
    });

    const response = NextResponse.json(
      {
        preferences,
        products: slice,
        total: deduped.length,
        page,
        pageSize,
      },
      { status: 200 }
    );
    if (prefsResult.upstream) {
      appendUpstreamCookies(response, prefsResult.upstream);
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load personalized feed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// buildPriceOverrides function removed - using Medusa prices only
