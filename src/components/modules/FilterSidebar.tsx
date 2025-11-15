// FilterSidebar: Left sidebar with filters for categories, price, ratings, and brands

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MedusaCategory } from "@/services/medusa";
import Link from "next/link";
import Image from "next/image";

export type DealPreview = {
  id: string | number;
  name: string;
  image: string;
  price: number;
};

type FilterSidebarProps = {
  categoryHandle: string;
  subcategories: MedusaCategory[];
  selectedSubcategory?: string;
  filters: FilterState;
  onFilterChange?: (next: Partial<FilterState>) => void;
  dealPreview?: DealPreview[];
  dealCount?: number;
};

export type FilterState = {
  subcategories: string[];
  priceMin?: number;
  priceMax?: number;
  ratings: number[];
  brands: string[];
  dealsOnly?: boolean;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const priceRanges = [
  { label: "Under ₹1000", min: 0, max: 1000 },
  { label: "₹1000 - ₹5000", min: 1000, max: 5000 },
  { label: "₹5000 - ₹10,000", min: 5000, max: 10000 },
  { label: "₹10,000 - ₹20,000", min: 10000, max: 20000 },
  { label: "Over ₹20,000", min: 20000, max: undefined },
];

export function FilterSidebar({
  categoryHandle,
  subcategories,
  selectedSubcategory,
  filters,
  onFilterChange,
  dealPreview,
  dealCount,
}: FilterSidebarProps) {
  const [showAllSubcategories, setShowAllSubcategories] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [searchSubcat, setSearchSubcat] = useState("");
  const [searchBrand, setSearchBrand] = useState("");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");

  useEffect(() => {
    setPriceMinInput(
      filters.priceMin !== undefined ? String(filters.priceMin) : ""
    );
    setPriceMaxInput(
      filters.priceMax !== undefined ? String(filters.priceMax) : ""
    );
  }, [filters.priceMin, filters.priceMax]);

  // Mock brands - in production, fetch from API or product metadata
  const brands = [
    "Nelkon",
    "Paras",
    "Syska",
    "Maharaja",
    "Crompton",
    "Oweg",
    "Bajaj",
    "Pigeon",
  ];

  const displayedSubcategories = showAllSubcategories
    ? subcategories.filter((s) =>
        (s.title || s.name || "")
          .toLowerCase()
          .includes(searchSubcat.toLowerCase())
      )
    : subcategories.slice(0, 5);

  const displayedBrands = showAllBrands
    ? brands.filter((b) => b.toLowerCase().includes(searchBrand.toLowerCase()))
    : brands.slice(0, 8);

  const handleRatingToggle = (rating: number) => {
    const currentRatings = filters.ratings || [];
    const newRatings = currentRatings.includes(rating)
      ? currentRatings.filter((r) => r !== rating)
      : [...currentRatings, rating];
    onFilterChange?.({ ratings: newRatings });
  };

  const handleBrandToggle = (brand: string) => {
    const currentBrands = filters.brands || [];
    const newBrands = currentBrands.includes(brand)
      ? currentBrands.filter((b) => b !== brand)
      : [...currentBrands, brand];

    onFilterChange?.({ brands: newBrands });
  };

  const handlePriceApply = () => {
    const min = priceMinInput ? parseFloat(priceMinInput) : undefined;
    const max = priceMaxInput ? parseFloat(priceMaxInput) : undefined;

    if (min !== undefined && max !== undefined && min > max) {
      alert("Minimum price cannot be greater than maximum price");
      return;
    }

    onFilterChange?.({
      priceMin: min,
      priceMax: max,
    });
  };

  const activePriceRangeKey = useMemo(() => {
    if (filters.priceMin === undefined && filters.priceMax === undefined) {
      return null;
    }
    const match = priceRanges.find((range) => {
      const minMatches =
        range.min === undefined
          ? filters.priceMin === undefined
          : range.min === filters.priceMin;
      const maxMatches =
        range.max === undefined
          ? filters.priceMax === undefined
          : range.max === filters.priceMax;
      return minMatches && maxMatches;
    });
    return match?.label ?? null;
  }, [filters.priceMin, filters.priceMax]);

  return (
    <div className="w-full lg:w-80 bg-white border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Shop by</h2>

        {/* Subcategory Filter */}
        {subcategories.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Subcategory</h3>

            {showAllSubcategories && (
              <div className="mb-3">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchSubcat}
                  onChange={(e) => setSearchSubcat(e.target.value)}
                  className="w-full"
                />
              </div>
            )}

            <ul className="space-y-2">
              {displayedSubcategories.map((subcat) => {
                const subcatTitle = subcat.title || subcat.name || "Category";
                const subcatHandle = subcat.handle || subcat.id;
                const isActive = selectedSubcategory === subcatHandle;

                return (
                  <li key={subcat.id}>
                    <Link
                      href={`/c/${categoryHandle}/${subcatHandle}`}
                      className={`block text-sm hover:text-[#7AC943] transition-colors ${
                        isActive
                          ? "text-[#7AC943] font-semibold"
                          : "text-gray-700"
                      }`}
                    >
                      {subcatTitle}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {subcategories.length > 5 && (
              <button
                onClick={() => setShowAllSubcategories(!showAllSubcategories)}
                className="flex items-center gap-1 text-sm text-[#7AC943] hover:underline mt-2"
              >
                {showAllSubcategories ? (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    See less
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    See all Subcategories
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Customer Review Filter */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Customer Review</h3>
          <ul className="space-y-2">
            {[4, 3, 2, 1].map((rating) => (
              <li key={rating}>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={(filters.ratings || []).includes(rating)}
                    onChange={() => handleRatingToggle(rating)}
                    className="w-4 h-4 accent-[#7AC943]"
                  />
                  <div className="flex items-center gap-1">
                    {Array.from({ length: rating }).map((_, i) => (
                      <Star
                        key={i}
                        className="w-4 h-4 fill-[#7AC943] text-[#7AC943]"
                      />
                    ))}
                    {Array.from({ length: 5 - rating }).map((_, i) => (
                      <Star
                        key={i + rating}
                        className="w-4 h-4 text-gray-300"
                      />
                    ))}
                    <span className="text-sm text-gray-700 group-hover:text-[#7AC943]">
                      & Up
                    </span>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* Brand Filter */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Brand</h3>

          {showAllBrands && (
            <div className="mb-3">
              <Input
                type="text"
                placeholder="Search"
                value={searchBrand}
                onChange={(e) => setSearchBrand(e.target.value)}
                className="w-full"
              />
            </div>
          )}

          <ul className="space-y-2">
            {displayedBrands.map((brand) => (
              <li key={brand}>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={(filters.brands || []).includes(brand)}
                    onChange={() => handleBrandToggle(brand)}
                    className="w-4 h-4 accent-[#7AC943]"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-[#7AC943]">
                    {brand}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {brands.length > 8 && (
            <button
              onClick={() => setShowAllBrands(!showAllBrands)}
              className="flex items-center gap-1 text-sm text-[#7AC943] hover:underline mt-2"
            >
              {showAllBrands ? (
                <>
                  <ChevronDown className="w-4 h-4" />
                  See less
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4" />
                  See more
                </>
              )}
            </button>
          )}
        </div>

        {/* Price Filter */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Price</h3>
          <ul className="space-y-2 text-sm text-gray-700 mb-3">
            {priceRanges.map((range) => (
              <li key={range.label}>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange?.({
                      priceMin: range.min,
                      priceMax: range.max,
                    })
                  }
                  className={`w-full text-left hover:text-[#7AC943] ${
                    activePriceRangeKey === range.label
                      ? "text-[#7AC943] font-semibold"
                      : ""
                  }`}
                >
                  {range.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t pt-3">
            <div className="flex gap-2 items-center mb-2">
              <Input
                type="number"
                placeholder="₹Min"
                value={priceMinInput}
                onChange={(e) => setPriceMinInput(e.target.value)}
                className="w-20"
              />
              <Input
                type="number"
                placeholder="₹Max"
                value={priceMaxInput}
                onChange={(e) => setPriceMaxInput(e.target.value)}
                className="w-20"
              />
              <Button
                onClick={handlePriceApply}
                size="sm"
                type="button"
                className="bg-[#7AC943] hover:bg-[#6BB832] text-white"
              >
                Go
              </Button>
            </div>
          </div>
        </div>

        {/* Deals Filter */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Deals</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#7AC943]"
              checked={!!filters.dealsOnly}
              onChange={() =>
                onFilterChange?.({ dealsOnly: !filters.dealsOnly })
              }
            />
            <span
              className={`text-sm ${
                filters.dealsOnly ? "text-[#7AC943] font-semibold" : "text-gray-700"
              }`}
            >
              Today&apos;s Deals
              {typeof dealCount === "number" && dealCount > 0
                ? ` (${dealCount})`
                : ""}
            </span>
          </label>
          {dealPreview && dealPreview.length > 0 ? (
            <div className="mt-3 space-y-2">
              {dealPreview.slice(0, 3).map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center gap-2 rounded-md border border-gray-100 p-2"
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                    <Image
                      src={deal.image || "/oweg_logo.png"}
                      alt={deal.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700 line-clamp-1">
                      {deal.name}
                    </p>
                    <p className="text-xs text-[#7AC943] font-semibold">
                      {inr.format(deal.price)}
                    </p>
                  </div>
                </div>
              ))}
              {dealCount && dealCount > dealPreview.length && (
                <p className="text-[11px] text-gray-500">
                  +{dealCount - dealPreview.length} more deals live
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              No live deals fetched for this category.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

