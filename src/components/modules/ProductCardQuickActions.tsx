"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AddFabPlusIcon,
  QtyCheckAddedIcon,
  QtyMinusIcon,
  QtyPlusIcon,
} from "@/components/ui/icons/product-actions";
import { Loader2 } from "lucide-react";
import { useCartLineByVariant } from "@/hooks/useCart";
import {
  useAddToCartWithNotification,
  useUpdateCartLineQuantity,
} from "@/hooks/useCartMutations";

export type ProductCardQuickActionsProps = {
  variantId?: string;
  selectionHref?: string;
  productName: string;
  disabled?: boolean;
  isHovered: boolean;
  inventoryQuantity?: number;
  className?: string;
  children?: React.ReactNode;
  layout?: "overlay" | "inline";
};

function stopCardNavigation(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function ProductCardQuickActions({
  variantId,
  selectionHref,
  productName,
  disabled = false,
  isHovered,
  inventoryQuantity,
  className = "",
  children,
  layout = "overlay",
}: ProductCardQuickActionsProps) {
  const { line } = useCartLineByVariant(selectionHref ? undefined : variantId);
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

  const isVisible = layout === "inline" || inCart || isHovered;
  const pointerEvents = isVisible ? "auto" : "none";

  useEffect(() => {
    if (!showAddedFlash) return;
    const timer = window.setTimeout(() => setShowAddedFlash(false), 200);
    return () => window.clearTimeout(timer);
  }, [showAddedFlash]);

  const handleAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (!variantId || selectionHref || disabled || isBusy) return;
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
      className={`${layout === "inline" ? "relative w-full flex flex-col gap-2" : "absolute top-2 right-2 flex flex-col gap-2 z-30"} transition-all duration-150 ${
        isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
      } ${className}`}
      style={{ pointerEvents }}
    >
      {selectionHref && !disabled ? (
        <Link href={selectionHref} prefetch={false}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Choose options for ${productName}`}
          className="flex h-10 w-full items-center justify-center rounded-md bg-[#155344] px-2 text-sm font-semibold text-white hover:bg-[#103f34]">
          Choose options
        </Link>
      ) : inCart ? (
        <div
          className={`flex items-center justify-between border border-[#1F2A33]/20 bg-white overflow-hidden ${layout === "inline" ? "h-10 w-full rounded-md" : "h-9 min-w-[96px] rounded-full shadow-lg"} ${
            isBusy ? "opacity-70 cursor-wait pointer-events-none" : ""
          }`}
          role="group"
          aria-busy={isBusy || undefined}
          aria-label={`Quantity in cart: ${quantity}`}
        >
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isBusy}
            title={quantity <= 1 ? "Remove from cart" : "Decrease quantity"}
            aria-label={quantity <= 1 ? "Remove from cart" : "Decrease quantity"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center hover:bg-[#EAF8E7] transition ${
              isBusy ? "cursor-wait" : ""
            }`}
          >
            <QtyMinusIcon className="h-6 w-6" />
          </button>
          <span className="min-w-[28px] px-1 text-center text-sm font-bold text-[#1F2A33] tabular-nums">
            {isBusy ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-[#1F2A33]" aria-hidden />
            ) : (
              quantity
            )}
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
                : isBusy
                  ? "cursor-wait"
                  : "hover:bg-[#EAF8E7]"
            }`}
          >
            <QtyPlusIcon className="h-6 w-6" />
          </button>
        </div>
      ) : showAddedFlash ? (
        <div
          className={layout === "inline" ? "flex h-10 w-full items-center justify-center rounded-md bg-[#155344] text-sm font-semibold text-white" : "flex h-9 w-9 items-center justify-center"}
          aria-label="Added to cart"
        >
          <QtyCheckAddedIcon className="h-9 w-9 drop-shadow-md" />
          {layout === "inline" && "Added to cart"}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAdd}
          title={disabled ? "Out of Stock" : isAdding ? "Adding…" : "Add to Cart"}
          disabled={!canAdd || isBusy}
          aria-busy={isAdding || undefined}
          aria-label={disabled ? "Out of Stock" : isAdding ? "Adding to cart" : "Add to Cart"}
          className={`${layout === "inline" ? "relative flex h-10 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#155344] px-2 text-sm font-semibold text-white hover:bg-[#103f34] disabled:bg-[#e9eeeb] disabled:text-[#75817b]" : "relative flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 shadow-none before:absolute before:-inset-1 before:content-['']"} transition ${
            canAdd && !isBusy ? "hover:scale-105" : "cursor-not-allowed"
          } ${isBusy ? "opacity-60 cursor-wait" : ""}`}
        >
          {layout === "inline" ? (
            <>{isAdding && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{disabled ? "Out of stock" : isAdding ? "Adding…" : "Add to Cart"}</>
          ) : isAdding ? (
            <Loader2 className="h-7 w-7 animate-spin text-[#66C940] drop-shadow-md" aria-hidden />
          ) : (
            <AddFabPlusIcon
              className={`h-9 w-9 drop-shadow-md ${canAdd ? "" : "grayscale opacity-60"}`}
            />
          )}
        </button>
      )}

      {children}
    </div>
  );
}
