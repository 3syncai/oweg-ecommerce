const MAHARASHTRA_ALIASES = new Set([
  "maharashtra",
  "mh",
  "maharastra",
  "maharastra state",
  "maharashtra state",
]);

export const SHIPPING_CHARGE_RUPEES = 50;
export const FREE_SHIPPING_THRESHOLD_RUPEES = 999;

function normalizeState(state?: string | null): string {
  if (!state) return "";
  return state
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

export function isMaharashtra(state?: string | null): boolean {
  const normalized = normalizeState(state);
  if (!normalized) return false;
  if (MAHARASHTRA_ALIASES.has(normalized)) return true;
  return normalized.includes("maharashtra");
}

export function calculateStatewiseShipping(subtotal: number, _state?: string | null): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0
  // ₹50 is charged only when the customer's cart is below the free-shipping threshold.
  if (subtotal >= FREE_SHIPPING_THRESHOLD_RUPEES) return 0
  return SHIPPING_CHARGE_RUPEES
}
