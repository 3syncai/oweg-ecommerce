export type VariantPriceInput = { title?: string | null; sku?: string | null; price?: unknown; discounted_price?: unknown }

export function variantPricingError(row: VariantPriceInput, index = 0): string | null {
  const label = `${row.title?.trim() || `Variant ${index + 1}`}${row.sku ? ` (SKU ${row.sku})` : ""}`
  const mrp = Number(row.price)
  if (row.price == null || String(row.price).trim() === "" || !Number.isFinite(mrp) || mrp <= 0)
    return `${label}: enter an MRP greater than zero.`
  const hasSale = row.discounted_price != null && String(row.discounted_price).trim() !== ""
  if (!hasSale) return null
  const sale = Number(row.discounted_price)
  if (!Number.isFinite(sale) || sale <= 0) return `${label}: enter a sale price greater than zero, or leave it empty.`
  if (sale > mrp) return `${label}: sale price ₹${sale} cannot exceed MRP ₹${mrp}. Correct the MRP or sale price.`
  return null
}

export function variantPricesError(rows: VariantPriceInput[]): string | null {
  if (!rows.length) return "Add at least one variant with a valid MRP."
  for (let index = 0; index < rows.length; index++) {
    const error = variantPricingError(rows[index], index)
    if (error) return error
  }
  return null
}
