/** Backorders are not sold as in-stock items on the storefront. */
export function isVariantPurchasable(variant: {
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number
}): boolean {
  if (variant.manage_inventory === false) return true
  return typeof variant.inventory_quantity === "number" && variant.inventory_quantity > 0
}
