import { customerShipping } from "../../my-medusa-store/src/lib/storefront-shipping";
export { SHIPPING_CHARGE_RUPEES, FREE_SHIPPING_THRESHOLD_RUPEES } from "../../my-medusa-store/src/lib/storefront-shipping";
const MAHARASHTRA_ALIASES = new Set([
  "maharashtra",
  "mh",
  "maharastra",
  "maharastra state",
  "maharashtra state",
]);


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
  return customerShipping(subtotal)
}
