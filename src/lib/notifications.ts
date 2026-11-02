"use client";

import { toast } from "sonner";

// A shared ID replaces old shopping feedback instead of stacking stale messages.
export const SHOPPING_FEEDBACK_ID = "oweg-shopping-feedback";
export const ACTION_STATUS_EVENT = "oweg:action-status";
export function announceAction(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACTION_STATUS_EVENT, { detail: message }));
}

export const notifyCartAddSuccess = (
  _label: string,
  quantity: number,
  onViewCart?: () => void
) => toast.success(quantity > 1 ? `${quantity} items added to cart` : "Added to cart", {
  id: SHOPPING_FEEDBACK_ID,
  duration: 5000,
  description: undefined,
  action: onViewCart ? { label: "View cart", onClick: onViewCart } : undefined,
});

export const notifyCartAddError = (message?: string) =>
  toast.error("Couldn’t add item", {
    id: SHOPPING_FEEDBACK_ID,
    duration: 7000,
    action: undefined,
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
  toast.info("Sign in to save items", {
    id: SHOPPING_FEEDBACK_ID,
    duration: 6000,
    description: undefined,
    action: onLogin ? { label: "Sign in", onClick: onLogin } : undefined,
  });

export const notifyWishlistSuccess = (_label?: string) => announceAction("Saved to wishlist");

export const notifyWishlistRemoved = (onUndo: () => void) => {
  let used = false;
  return toast("Removed from wishlist", {
    id: SHOPPING_FEEDBACK_ID,
    duration: 6000,
    description: undefined,
    action: { label: "Undo", onClick: () => { if (!used) { used = true; onUndo(); } } },
  });
};

export const notifyCouponApplied = (code: string) =>
  toast.success("Coupon applied", {
    description: code.toUpperCase(),
  });

export const notifyCouponCheckoutOnly = (code: string) =>
  toast.info(`Use ${code.toUpperCase()} at checkout`, {
    description: "This one-time offer is verified against your account during checkout.",
  });

export const notifyCouponInvalid = () =>
  toast.error("Invalid coupon code", {
    description: "Please double-check and try again.",
  });

export const notifyQuantityUpdated = (_label: string, quantity: number) =>
  announceAction(`Quantity updated to ${quantity}`);

export const notifyRemoveItem = (_label: string) =>
  toast("Removed from cart", { id: SHOPPING_FEEDBACK_ID, duration: 3500, description: undefined, action: undefined });

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
    id: SHOPPING_FEEDBACK_ID,
    duration: 7000,
    action: undefined,
    description: description?.trim(),
  });
