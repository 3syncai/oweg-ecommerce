/** Use the charge frozen at checkout, so policy changes cannot reprice old orders. */
export function orderCustomerShipping(metadata: Record<string, unknown> | null | undefined, subtotal: number): number {
  const value = metadata?.expected_shipping_price
  if ((typeof value === "number" || (typeof value === "string" && value.trim() !== ""))) {
    const charge = Number(value)
    if (Number.isFinite(charge) && charge >= 0) return charge
  }
  // Legacy orders without a frozen charge used the original Rs 500 threshold.
  // New checkout orders always persist expected_shipping_price, including zero.
  return Number.isFinite(subtotal) && subtotal > 0 && subtotal < 500 ? 50 : 0
}
