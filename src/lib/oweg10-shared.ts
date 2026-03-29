export const OWEG10_CODE = "OWEG10";
const OWEG10_PERCENT = 10;

export function calculateOweg10Discount(subtotal: number) {
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const subtotalMinor = Math.round(safeSubtotal * 100);
  const discountMinor = Math.round((subtotalMinor * OWEG10_PERCENT) / 100);
  return discountMinor / 100;
}
