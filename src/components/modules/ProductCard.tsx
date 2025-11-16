// ProductCard: Reusable card for product listings with hover effects and quick actions

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProductCardProps = {
  id: string | number;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  handle?: string;
  sourceTag?: string;
  sourceCategoryId?: string;
  sourceCategoryHandle?: string;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ProductCard({
  id,
  name,
  image,
  price,
  mrp,
  discount,
  limitedDeal,
  variant_id,
  handle,
  sourceTag,
  sourceCategoryId,
  sourceCategoryHandle,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const params = new URLSearchParams();
  params.set("id", String(id));
  if (sourceTag) params.set("sourceTag", sourceTag);
  if (sourceCategoryId) params.set("sourceCategoryId", sourceCategoryId);
  if (sourceCategoryHandle) params.set("sourceCategoryHandle", sourceCategoryHandle);
  const productHref = `/productDetail/${encodeURIComponent(handle || id)}?${params.toString()}`;

  const handleQuickAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!variant_id) {
      alert("This product is not available for purchase");
      return;
    }

    setIsAdding(true);
    try {
      await fetch("/api/medusa/cart", { method: "POST" });
      const response = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id, quantity: 1 }),
      });

      if (!response.ok) throw new Error("Failed to add to cart");
      alert("Added to cart successfully!");
    } catch (error) {
      console.error("Failed to add to cart:", error);
      alert("Failed to add to cart. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Link href={productHref}>
      <div
        className="group relative bg-white rounded-lg border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-[#7AC943] cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Limited Deal Badge */}
        {limitedDeal && discount > 0 && (
          <div className="absolute top-2 left-2 z-10 flex gap-2">
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
              {discount}% off
            </span>
            <span className="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
              Limited time deal
            </span>
          </div>
        )}

        {/* Product Image */}
        <div className="relative aspect-square w-full bg-gray-50 overflow-hidden">
          <Image
            src={image || "/oweg_logo.png"}
            alt={name}
            fill
            className={`object-contain p-4 transition-transform duration-300 ${
              isHovered ? "scale-110" : "scale-100"
            }`}
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />

          {/* Quick Add Button - Appears on Hover */}
          <div
            className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${
              isHovered ? "opacity-100" : "opacity-0"
            }`}
          >
            <Button
              onClick={handleQuickAdd}
              disabled={isAdding || !variant_id}
              className="w-full bg-[#7AC943] hover:bg-[#6BB832] text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              {isAdding ? "Adding..." : "Add to Cart"}
            </Button>
          </div>
        </div>

        {/* Product Info */}
        <div className="p-3">
          {/* Price Section */}
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {inr.format(price)}
              </span>
              {mrp > price && (
                <span className="text-sm text-gray-500 line-through">
                  M.R.P: {inr.format(mrp)}
                </span>
              )}
            </div>
          </div>

          {/* Product Name */}
          <h3 className="text-sm text-gray-700 line-clamp-2 min-h-[2.5rem] group-hover:text-[#7AC943] transition-colors">
            {name}
          </h3>
        </div>

        {/* Hover Border Effect */}
        <div
          className={`absolute inset-0 border-2 border-[#7AC943] rounded-lg pointer-events-none transition-opacity duration-300 ${
            isHovered ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </Link>
  );
}

