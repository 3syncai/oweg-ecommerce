"use client";

import { toast } from "sonner";

const formatLine = (label?: string, quantity?: number) => {
  const name = label?.trim() ? label.trim() : "Item";
  return typeof quantity === "number" && quantity > 0
    ? `${name} • Qty ${quantity}`
    : name;
};

export const notifyCartAddSuccess = (
  label: string,
  quantity: number,
  onViewCart?: () => void
) =>
  toast.success("Added to cart!", {
    description: formatLine(label, quantity),
    action: onViewCart
      ? {
          label: "View Cart",
          onClick: onViewCart,
        }
      : undefined,
  });

export const notifyCartAddError = (message?: string) =>
  toast.error("Unable to add to cart", {
    description: message?.trim() || "Please try again.",
  });

export const notifyCartUnavailable = () =>
  toast.warning("This item is currently unavailable", {
    description: "Try selecting another option.",
  });

export const notifyOutOfStock = () =>
  toast.error("Out of stock", {
    description: "This item cannot be purchased right now.",
  });

export const notifyWishlistLogin = (onLogin?: () => void) =>
  toast.info("Login required", {
    description: "Please sign in to save items to your wishlist.",
    action: onLogin
      ? {
          label: "Login",
          onClick: onLogin,
        }
      : undefined,
  });

export const notifyWishlistSuccess = (label?: string) =>
  toast.success("Saved to wishlist!", {
    description: formatLine(label),
  });

export const notifyCouponApplied = (code: string) =>
  toast.success("Coupon applied", {
    description: code.toUpperCase(),
  });

export const notifyCouponInvalid = () =>
  toast.error("Invalid coupon code", {
    description: "Please double-check and try again.",
  });

export const notifyQuantityUpdated = (label: string, quantity: number) =>
  toast("Quantity updated", {
    description: formatLine(label, quantity),
  });

export const notifyRemoveItem = (label: string) =>
  toast.info("Item removed from cart", {
    description: formatLine(label),
  });

export const notifyCartUpdated = () =>
  toast.success("Cart updated", {
    description: "Totals refreshed with your latest changes.",
  });

export const notifyCheckoutComingSoon = () =>
  toast.info("Checkout coming soon", {
    description: "We're preparing a seamless checkout experience.",
  });

export const notifyActionError = (title: string, description?: string) =>
  toast.error(title, {
    description: description?.trim(),
  });
