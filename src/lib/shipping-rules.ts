const MAHARASHTRA_ALIASES = new Set([
  "maharashtra",
  "mh",
  "maharastra",
  "maharastra state",
  "maharashtra state",
]);

export const SHIPPING_CHARGE_RUPEES = 50;

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
  if (subtotal > 1000) return 0;
  return SHIPPING_CHARGE_RUPEES;
}

