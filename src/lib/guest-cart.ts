// guest-cart: Utility functions for managing guest cart in localStorage

const GUEST_CART_KEY = "guest_cart_id";

/**
 * Get guest cart ID from localStorage
 */
export function getGuestCartId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(GUEST_CART_KEY);
  } catch {
    return null;
  }
}

/**
 * Set guest cart ID in localStorage
 */
export function setGuestCartId(cartId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CART_KEY, cartId);
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded)
  }
}

/**
 * Remove guest cart ID from localStorage
 */
export function clearGuestCartId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_CART_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Check if a cart ID is a guest cart (stored in localStorage)
 */
export function isGuestCart(cartId: string | null): boolean {
  if (!cartId) return false;
  const guestCartId = getGuestCartId();
  return guestCartId === cartId;
}

