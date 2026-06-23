"use client";

import { useEffect, useState } from "react";
import {
  AddFabPlusIcon,
  QtyCheckAddedIcon,
  QtyMinusIcon,
  QtyPlusIcon,
} from "@/components/ui/icons/product-actions";
import { useCartLineByVariant } from "@/hooks/useCart";
import {
  useAddToCartWithNotification,
  useUpdateCartLineQuantity,
} from "@/hooks/useCartMutations";

export type ProductCardQuickActionsProps = {
  variantId?: string;
  productName: string;
  disabled?: boolean;
  isHovered: boolean;
  inventoryQuantity?: number;
  className?: string;
  children?: React.ReactNode;
};

function stopCardNavigation(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function ProductCardQuickActions({
  variantId,
  productName,
  disabled = false,
  isHovered,
  inventoryQuantity,
  className = "",
  children,
}: ProductCardQuickActionsProps) {
  const { line } = useCartLineByVariant(variantId);
  const { addToCart, isLoading: isAdding } = useAddToCartWithNotification(productName);
  const { updateQuantity, isUpdating } = useUpdateCartLineQuantity();
  const [showAddedFlash, setShowAddedFlash] = useState(false);

  const quantity = line?.quantity ?? 0;
  const inCart = quantity > 0;
  const isBusy = isAdding || isUpdating;
  const canAdd = Boolean(variantId) && !disabled;
  const maxQty =
    typeof inventoryQuantity === "number" && inventoryQuantity > 0
      ? inventoryQuantity
      : undefined;
  const atMaxQty = maxQty != null && quantity >= maxQty;

  const isVisible = inCart || isHovered;
  const pointerEvents = isVisible ? "auto" : "none";

  useEffect(() => {
    if (!showAddedFlash) return;
    const timer = window.setTimeout(() => setShowAddedFlash(false), 400);
    return () => window.clearTimeout(timer);
  }, [showAddedFlash]);

  const handleAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (!variantId || disabled || isBusy) return;
    await addToCart(variantId);
    setShowAddedFlash(true);
  };

  const handleIncrement = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (!line?.lineId || isBusy || atMaxQty) return;
    await updateQuantity(line.lineId, quantity + 1, productName);
  };

  const handleDecrement = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (!line?.lineId || isBusy) return;
    await updateQuantity(line.lineId, quantity - 1, productName);
  };

  return (
    <div
      className={`absolute top-2 right-2 flex flex-col gap-2 z-30 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
      } ${className}`}
      style={{ pointerEvents }}
    >
      {inCart ? (
        <div
          className={`flex items-center rounded-full border border-[#1F2A33]/20 bg-white shadow-lg overflow-hidden h-9 min-w-[96px] ${
            isBusy ? "opacity-60 pointer-events-none" : ""
          }`}
          role="group"
          aria-label={`Quantity in cart: ${quantity}`}
        >
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isBusy}
            title={quantity <= 1 ? "Remove from cart" : "Decrease quantity"}
            aria-label={quantity <= 1 ? "Remove from cart" : "Decrease quantity"}
            className="flex h-9 w-9 shrink-0 items-center justify-center hover:bg-[#EAF8E7] transition"
          >
            <QtyMinusIcon className="h-6 w-6" />
          </button>
          <span className="min-w-[28px] px-1 text-center text-sm font-bold text-[#1F2A33] tabular-nums">
            {quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={isBusy || atMaxQty}
            title={atMaxQty ? "Maximum quantity reached" : "Increase quantity"}
            aria-label={atMaxQty ? "Maximum quantity reached" : "Increase quantity"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center transition ${
              atMaxQty
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-[#EAF8E7]"
            }`}
          >
            <QtyPlusIcon className="h-6 w-6" />
          </button>
        </div>
      ) : showAddedFlash ? (
        <div
          className="flex h-9 w-9 items-center justify-center"
          aria-label="Added to cart"
        >
          <QtyCheckAddedIcon className="h-9 w-9 drop-shadow-md" />
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAdd}
          title={disabled ? "Out of Stock" : "Add to Cart"}
          disabled={!canAdd || isBusy}
          aria-label={disabled ? "Out of Stock" : "Add to Cart"}
          className={`flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 shadow-none transition ${
            canAdd ? "hover:scale-105" : "cursor-not-allowed"
          } ${isBusy ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <AddFabPlusIcon
            className={`h-9 w-9 drop-shadow-md ${canAdd ? "" : "grayscale opacity-60"}`}
          />
        </button>
      )}

      {children}
    </div>
  );
}
