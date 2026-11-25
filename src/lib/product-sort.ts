export type ProductSort = "default" | "price-asc" | "price-desc";

export function parseProductSort(value: string | null | undefined): ProductSort {
  return value === "price-asc" || value === "price-desc" ? value : "default";
}

export function sortProductsByPrice<T extends { id: string | number; price?: number }>(
  products: T[],
  sort: ProductSort,
): T[] {
  if (sort === "default") return products;
  const direction = sort === "price-asc" ? 1 : -1;
  return [...products].sort((a, b) => {
    const aPrice = a.price && Number.isFinite(a.price) && a.price > 0 ? a.price : undefined;
    const bPrice = b.price && Number.isFinite(b.price) && b.price > 0 ? b.price : undefined;
    if (aPrice !== undefined && bPrice !== undefined && aPrice !== bPrice) {
      return direction * (aPrice - bPrice);
    }
    return Number(bPrice !== undefined) - Number(aPrice !== undefined) ||
      String(a.id).localeCompare(String(b.id));
  });
}
