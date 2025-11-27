// ProductDetailClient: Basic product detail display (client component)

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailedProduct } from "@/lib/medusa";
import { getImageUrlForNewTab } from "@/lib/image-utils";

type ProductDetailClientProps = {
  product: DetailedProduct;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = async () => {
    if (!product.variant_id) {
      alert("This product is not available for purchase");
      return;
    }

    setIsAdding(true);
    try {
      await fetch("/api/medusa/cart", { method: "POST" });
      const response = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variant_id: product.variant_id,
          quantity: 1,
        }),
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
    <div className="bg-white min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-600 mb-6">
          <Link href="/" className="hover:text-[#7AC943]">
            Home
          </Link>
          {product.categories.length > 0 && (
            <>
              <span className="mx-2">/</span>
              <Link
                href={`/c/${product.categories[0].handle || product.categories[0].id}`}
                className="hover:text-[#7AC943]"
              >
                {product.categories[0].title}
              </Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-gray-900">{product.title}</span>
        </nav>

        {/* Product Detail Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Images */}
          <div>
            {/* Main Image */}
            <div className="relative aspect-square w-full bg-gray-50 rounded-lg overflow-hidden mb-4">
              <a
                href={getImageUrlForNewTab(product.images[selectedImage] || product.thumbnail || "/oweg_logo.png")}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-10"
                onClick={(e) => {
                  // Only open in new tab on middle-click or Ctrl/Cmd+click
                  if (e.button === 1 || e.ctrlKey || e.metaKey) {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
                aria-label="Open image in new tab"
              >
                <Image
                  src={product.images[selectedImage] || product.thumbnail || "/oweg_logo.png"}
                  alt={product.title}
                  fill
                  className="object-contain p-8 pointer-events-none"
                  priority
                />
              </a>
            </div>

            {/* Thumbnail Gallery */}
            {product.images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === index
                        ? "border-[#7AC943]"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`${product.title} - ${index + 1}`}
                      fill
                      className="object-contain p-2"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product Info */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {product.title}
            </h1>

            {product.subtitle && (
              <p className="text-lg text-gray-600 mb-4">{product.subtitle}</p>
            )}

            {/* Price Section */}
            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-4xl font-bold text-[#7AC943]">
                  {inr.format(product.price)}
                </span>
                {product.mrp > product.price && (
                  <>
                    <span className="text-xl text-gray-500 line-through">
                      {inr.format(product.mrp)}
                    </span>
                    <span className="text-lg font-semibold text-red-600">
                      ({product.discount}% off)
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-600">Inclusive of all taxes</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mb-6">
              <Button
                onClick={handleAddToCart}
                disabled={isAdding || !product.variant_id}
                className="flex-1 bg-[#7AC943] hover:bg-[#6BB832] text-white text-lg py-6"
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                {isAdding ? "Adding..." : "Add to Cart"}
              </Button>
              <Button
                variant="outline"
                className="border-gray-300 hover:border-[#7AC943] hover:text-[#7AC943] py-6"
              >
                <Heart className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                className="border-gray-300 hover:border-[#7AC943] hover:text-[#7AC943] py-6"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </div>

            {/* Product Highlights */}
            {product.highlights && product.highlights.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  Highlights
                </h2>
                <ul className="list-disc list-inside space-y-2 text-gray-700">
                  {product.highlights.slice(0, 5).map((highlight, index) => (
                    <li key={index}>{highlight}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Description */}
            {product.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  Description
                </h2>
                <div
                  className="text-gray-700 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}

            {/* Categories */}
            {product.categories.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Categories:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.categories.map((category) => (
                    <Link
                      key={category.id}
                      href={`/c/${category.handle || category.id}`}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-[#7AC943] hover:text-white transition-colors"
                    >
                      {category.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Tags:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

