import { Modules } from "@medusajs/framework/utils"

type MedusaScope = {
  resolve: (key: string) => any
}

/**
 * Soft-delete inventory items linked to a product's variants so their SKUs
 * become available again (unique index is WHERE deleted_at IS NULL).
 */
export async function releaseInventorySkusForProduct(
  scope: MedusaScope,
  productId: string
): Promise<string[]> {
  const query = scope.resolve("query")
  const inventoryModule = scope.resolve(Modules.INVENTORY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "variants.id",
      "variants.sku",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { id: productId },
  })

  const product = products?.[0]
  if (!product) return []

  const inventoryItemIds = new Set<string>()
  for (const variant of product.variants || []) {
    for (const link of variant.inventory_items || []) {
      const id = link?.inventory_item_id
      if (typeof id === "string" && id) inventoryItemIds.add(id)
    }
  }

  const ids = Array.from(inventoryItemIds)
  if (ids.length === 0) return []

  await inventoryModule.softDeleteInventoryItems(ids)
  return ids
}

/**
 * Soft-delete inventory items whose SKU is no longer used by any active variant.
 * Fixes SKUs stuck after older deletes that left inventory rows behind.
 */
export async function releaseOrphanInventorySkus(
  scope: MedusaScope,
  skus: Array<string | null | undefined>
): Promise<string[]> {
  const query = scope.resolve("query")
  const inventoryModule = scope.resolve(Modules.INVENTORY)

  const uniqueSkus = Array.from(
    new Set(
      skus
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
    )
  )

  if (uniqueSkus.length === 0) return []

  const released: string[] = []

  for (const sku of uniqueSkus) {
    // Active variants only (query excludes soft-deleted by default)
    const { data: activeVariants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku"],
      filters: { sku },
    })

    if (activeVariants && activeVariants.length > 0) {
      continue
    }

    const orphanItems = await inventoryModule.listInventoryItems({ sku })
    if (!orphanItems?.length) continue

    const ids = orphanItems.map((item: { id: string }) => item.id)
    await inventoryModule.softDeleteInventoryItems(ids)
    released.push(...ids)
  }

  return released
}
