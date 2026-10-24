import { serializeVariantOptions, type ProductOptionDef, type VariantMatrixRow } from "./variant-matrix"
import type { ProductVariantInput } from "./api/contracts"

export function simpleProductPrices(row: VariantMatrixRow | undefined, fallback: { price: string; discountedPrice: string }) {
  return row
    ? { price: row.price.trim(), discountedPrice: row.discountedPrice.trim() }
    : { price: fallback.price.trim(), discountedPrice: fallback.discountedPrice.trim() }
}

export function serializeProductEditVariants(
  rows: VariantMatrixRow[], options: ProductOptionDef[] | undefined, hasVariants: boolean
): ProductVariantInput[] {
  return rows.map((row) => {
    const stock = row.inventoryCount.trim() ? Number(row.inventoryCount) : undefined
    if (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0)) throw new Error("Stock must be a nonnegative whole number")
    const price = row.price.trim() ? Number(row.price) : undefined
    const sale = row.discountedPrice.trim() ? Number(row.discountedPrice) : null
    if (price !== undefined && (!Number.isFinite(price) || price <= 0)) throw new Error("MRP must be greater than zero")
    if (sale !== null && (!Number.isFinite(sale) || sale <= 0 || (price !== undefined && sale >= price))) throw new Error("Sale price must be greater than zero and lower than MRP")
    return {
      id: row.id, title: row.title, sku: row.sku.trim() || null,
      manage_inventory: row.managedInventory, allow_backorder: row.allowBackorder,
      inventory_quantity: stock, price, discounted_price: sale,
      ...(options ? { options: hasVariants ? serializeVariantOptions(options, row.optionValues) : { Default: "Default" } } : {}),
    }
  })
}
