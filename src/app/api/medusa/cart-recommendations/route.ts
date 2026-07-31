import { NextRequest, NextResponse } from "next/server";
import {
  fetchProductsByCategoryId,
  fetchProductsByTag,
  findCategoryByTitleOrHandle,
  toUiProduct,
  isMedusaProductInStock,
} from "@/lib/medusa";

export const dynamic = "force-dynamic";

/**
 * Aggregated cart recommendations — one round-trip instead of N product-list fetches.
 * GET /api/medusa/cart-recommendations?contexts=tag:Bajaj,category:home-appliances&exclude=prod_1&limit=12
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contextsRaw = searchParams.get("contexts") || "";
    const excludeRaw = searchParams.get("exclude") || "";
    const limit = Math.min(Number(searchParams.get("limit") || 12) || 12, 24);
    const exclude = new Set(
      excludeRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    const contexts = contextsRaw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((part) => {
        const colon = part.indexOf(":");
        if (colon <= 0) return null;
        const kind = part.slice(0, colon);
        const value = part.slice(colon + 1);
        if ((kind !== "tag" && kind !== "category") || !value) return null;
        return { kind: kind as "tag" | "category", value };
      })
      .filter((ctx): ctx is { kind: "tag" | "category"; value: string } => Boolean(ctx));

    if (!contexts.length) {
      return NextResponse.json({ products: [] });
    }

    const batches = await Promise.all(
      contexts.map(async (ctx) => {
        try {
          if (ctx.kind === "tag") {
            return await fetchProductsByTag(ctx.value, 12);
          }
          const cat =
            (await findCategoryByTitleOrHandle(ctx.value)) ||
            null;
          if (!cat?.id) return { products: [], count: 0 };
          return await fetchProductsByCategoryId(cat.id, 12, {
            includeSubcategories: true,
          });
        } catch {
          return { products: [], count: 0 };
        }
      })
    );

    const seen = new Set<string>();
    const products = [];
    for (const batch of batches) {
      for (const product of batch.products || []) {
        if (!product?.id || exclude.has(product.id) || seen.has(product.id)) continue;
        if (!isMedusaProductInStock(product)) continue;
        seen.add(product.id);
        products.push(toUiProduct(product));
        if (products.length >= limit) break;
      }
      if (products.length >= limit) break;
    }

    return NextResponse.json({ products });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed";
    return NextResponse.json({ products: [], error: message }, { status: 500 });
  }
}
