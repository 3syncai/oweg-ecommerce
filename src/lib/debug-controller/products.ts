import { adminFetch } from "@/lib/medusa-admin";
import type { ProductSearchResult } from "./types";

type AdminProduct = {
  id: string;
  title?: string;
  handle?: string;
  status?: string;
  thumbnail?: string | null;
};

function extractProducts(data: unknown): AdminProduct[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.products)) return root.products as AdminProduct[];
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const products = (nested as Record<string, unknown>).products;
    if (Array.isArray(products)) return products as AdminProduct[];
  }
  return [];
}

export async function searchAdminProducts(
  query: string,
  limit = 20
): Promise<ProductSearchResult[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    fields: "id,title,handle,status,thumbnail",
  });
  if (query.trim()) {
    params.set("q", query.trim());
  }

  const res = await adminFetch(`/admin/products?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Product search failed (${res.status})`);
  }

  return extractProducts(res.data).map((product) => ({
    id: product.id,
    title: product.title || "Untitled",
    handle: product.handle || "",
    status: product.status || "unknown",
    thumbnail: product.thumbnail ?? null,
  }));
}

export async function deleteAdminProduct(productId: string) {
  const res = await adminFetch(`/admin/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(`Failed to delete product (${res.status})`);
  }

  return res.data;
}
