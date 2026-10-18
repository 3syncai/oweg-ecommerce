import { getSharedDbPool } from "./db-pool"

/** Read colour, size, and other variant choices from Medusa's product tables. */
export async function getVendorVariantOptions(variantIds: string[]) {
  const ids = [...new Set(variantIds.filter(Boolean))]
  const byVariant = new Map<string, Record<string, string>>()
  if (!ids.length) return byVariant

  const { rows } = await getSharedDbPool().query<{
    variant_id: string
    title: string
    value: string
  }>(`
    SELECT pvo.variant_id, po.title, pov.value
    FROM product_variant_option pvo
    JOIN product_option_value pov ON pov.id = pvo.option_value_id AND pov.deleted_at IS NULL
    JOIN product_option po ON po.id = pov.option_id AND po.deleted_at IS NULL
    WHERE pvo.variant_id = ANY($1::text[])
    ORDER BY po.title, pov.value
  `, [ids])
  for (const row of rows) {
    const options = byVariant.get(row.variant_id) || {}
    options[row.title] = row.value
    byVariant.set(row.variant_id, options)
  }
  return byVariant
}
