import { NextRequest, NextResponse } from "next/server";
import {
  fetchProductsByCategoryId,
  fetchProductsByTag,
  fetchProductsByType,
  findCategoryByTitleOrHandle,
  toUiProduct,
  type MedusaProduct,
} from "@/lib/medusa";
import { executeReadQuery } from "@/lib/mysql";
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

type PriceOverride = {
  price?: number;
  mrp?: number;
  isDeal?: boolean;
  opencartId?: string;
};

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
    const priceOverrides = await buildPriceOverrides(deduped.map((h) => h.product));
    const start = (page - 1) * pageSize;
    const slice = deduped.slice(start, start + pageSize).map((hit) => {
      const override = priceOverrides.get(hit.product.id);
      const ui = toUiProduct(hit.product, override);
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

function normalizeProductName(name?: string | null) {
  return (name || "").trim().toLowerCase();
}

async function buildPriceOverrides(products: MedusaProduct[]) {
  const map = new Map<string, PriceOverride>();
  const productIdToOcId = new Map<string, string>();
  const ocIdToMedusaIds = new Map<string, string[]>();
  const fallbackProducts: MedusaProduct[] = [];

  for (const product of products) {
    const metadata = (product.metadata || {}) as Record<string, unknown>;
    const ocId = metadata["opencart_id"] as string | number | undefined;
    if (ocId !== undefined && ocId !== null) {
      const ocIdStr = String(ocId);
      productIdToOcId.set(product.id, ocIdStr);
      const existing = ocIdToMedusaIds.get(ocIdStr) || [];
      existing.push(product.id);
      ocIdToMedusaIds.set(ocIdStr, existing);
    } else {
      fallbackProducts.push(product);
    }
  }

  const distinctOcIds = Array.from(new Set(productIdToOcId.values()));

  if (distinctOcIds.length > 0) {
    const placeholders = distinctOcIds.map(() => "?").join(",");
    try {
      const rows = await executeReadQuery<
        Array<{ product_id: number; price: string | null; special_price: string | null }>
      >(
        `
          SELECT 
            p.product_id,
            p.price,
            (
              SELECT ps.price
              FROM oc_product_special ps
              WHERE ps.product_id = p.product_id
                AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
                AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
              ORDER BY ps.priority ASC, ps.price ASC
              LIMIT 1
            ) AS special_price
          FROM oc_product p
          WHERE p.product_id IN (${placeholders})
        `,
        distinctOcIds
      );

      for (const row of rows) {
        const medusaIds = ocIdToMedusaIds.get(String(row.product_id)) || [];
        if (!medusaIds.length) continue;
        const basePrice = parseFloat(row.price || "");
        const specialPrice = row.special_price ? parseFloat(row.special_price) : undefined;
        const hasBase = Number.isFinite(basePrice);
        const hasSpecial = Number.isFinite(specialPrice);

        if (!hasBase && !hasSpecial) continue;

        for (const medusaId of medusaIds) {
          map.set(medusaId, {
            price: hasSpecial ? (specialPrice as number) : (basePrice as number),
            mrp: hasBase ? (basePrice as number) : hasSpecial ? (specialPrice as number) : undefined,
            isDeal: hasSpecial,
            opencartId: String(row.product_id),
          });
        }
      }
    } catch (err) {
      console.warn("personalized/products: price override via OC IDs failed", err);
    }
  }

  if (fallbackProducts.length === 0) {
    return map;
  }

  const nameMap = new Map<string, { originalName: string; medusaIds: string[] }>();

  for (const product of fallbackProducts) {
    const key = normalizeProductName(product.title || product.subtitle);
    if (!key) continue;
    const originalName = product.title || product.subtitle || product.handle || "";
    if (!originalName) continue;
    const entry = nameMap.get(key);
    if (entry) {
      entry.medusaIds.push(product.id);
    } else {
      nameMap.set(key, { originalName, medusaIds: [product.id] });
    }
  }

  await Promise.all(
    Array.from(nameMap.values()).map(async ({ originalName, medusaIds }) => {
      try {
        const rows = await executeReadQuery<
          Array<{ price: string | null; special_price: string | null }>
        >(
          `
            SELECT 
              p.price,
              (
                SELECT ps.price
                FROM oc_product_special ps
                WHERE ps.product_id = p.product_id
                  AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
                  AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
                ORDER BY ps.priority ASC, ps.price ASC
                LIMIT 1
              ) AS special_price
            FROM oc_product p
            INNER JOIN oc_product_description pd 
              ON p.product_id = pd.product_id AND pd.language_id = 1
            WHERE pd.name = ?
            LIMIT 1
          `,
          [originalName]
        );

        const row = rows[0];
        if (!row) return;
        const basePrice = parseFloat(row.price || "");
        const specialPrice = row.special_price ? parseFloat(row.special_price) : undefined;
        const hasBase = Number.isFinite(basePrice);
        const hasSpecial = Number.isFinite(specialPrice);
        if (!hasBase && !hasSpecial) return;

        for (const medusaId of medusaIds) {
          map.set(medusaId, {
            price: hasSpecial ? (specialPrice as number) : (basePrice as number),
            mrp: hasBase ? (basePrice as number) : hasSpecial ? (specialPrice as number) : undefined,
            isDeal: hasSpecial,
          });
        }
      } catch (err) {
        console.warn("personalized/products: fallback price lookup failed", originalName, err);
      }
    })
  );

  return map;
}
