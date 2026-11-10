export type CategoryFilters = {
  priceMin?: number;
  priceMax?: number;
  brands: string[];
  dealsOnly: boolean;
};

export function parseCategoryBrands(values: string[]) {
  return [...new Set(values.map(value => value.trim().toLowerCase())
    .filter(value => value.length > 0 && value.length <= 80))].sort().slice(0, 20);
}

export function parseCategoryPrice(value: string | null | undefined) {
  if (!value?.trim()) return undefined;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}
