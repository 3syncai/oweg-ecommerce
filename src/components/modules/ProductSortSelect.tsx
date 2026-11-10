"use client";

import { ArrowDownUp, ChevronDown } from "lucide-react";
import { parseProductSort, type ProductSort } from "@/lib/product-sort";

export function ProductSortSelect({ value, onChange, defaultLabel, priceSortAvailable = true }: {
  value: ProductSort;
  onChange: (value: ProductSort) => void;
  defaultLabel: string;
  priceSortAvailable?: boolean;
}) {
  return (
    <label className="relative inline-flex min-h-11 min-w-0 items-center rounded-xl border border-[#d9e3d7] bg-white text-sm font-semibold text-[#23473a] focus-within:ring-2 focus-within:ring-[#477e31]">
      <ArrowDownUp size={16} className="pointer-events-none absolute left-3" aria-hidden="true" />
      <span className="sr-only">Sort by</span>
      <select value={value} onChange={event => onChange(parseProductSort(event.target.value))}
        className="min-h-11 w-full min-w-0 cursor-pointer appearance-none rounded-xl bg-transparent py-2 pl-9 pr-8 outline-none">
        <option value="default">{defaultLabel}</option>
        <option value="price-asc" disabled={!priceSortAvailable}>Price: Low to high</option>
        <option value="price-desc" disabled={!priceSortAvailable}>Price: High to low</option>
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3" aria-hidden="true" />
    </label>
  );
}
