export const SHIPPING_CHARGE_RUPEES = 50
export const FREE_SHIPPING_THRESHOLD_RUPEES = 999

export function customerShipping(subtotal: number): number {
  return Number.isFinite(subtotal) && subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD_RUPEES ? SHIPPING_CHARGE_RUPEES : 0
}
