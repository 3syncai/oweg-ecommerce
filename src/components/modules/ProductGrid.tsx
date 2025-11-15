// ProductGrid: Grid layout for displaying products with responsive columns

"use client";

import { ProductCard, ProductCardProps } from "./ProductCard";

type ProductGridProps = {
  products: ProductCardProps[];
  isLoading?: boolean;
  showEmpty?: boolean;
};

export function ProductGrid({
  products,
  isLoading,
  showEmpty,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-80 rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
          >
            <div className="h-2/3 w-full rounded-t-xl bg-gray-100 animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
              <div className="h-6 w-full rounded bg-gray-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (showEmpty || products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-6xl mb-4">📦</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No products found
        </h3>
        <p className="text-gray-600">
          Try adjusting your filters or check back later
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} {...product} />
      ))}
    </div>
  );
}

