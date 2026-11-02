import { deleteSearchDocument, upsertProductToSearch } from "./search-index"

type RecordData = Record<string, any>
type SearchScope = { resolve: (key: string) => any }

// Prices and inventory are linked modules in v2, not product-service relations.
export async function loadProductForSearch(scope: SearchScope, id: string): Promise<RecordData | null> {
  const query = scope.resolve("query")
  const { data } = await query.graph({
    entity: "product", filters: { id },
    fields: [
      "id", "handle", "title", "subtitle", "description", "thumbnail", "status",
      "created_at", "updated_at", "metadata", "collection_id", "collection.title",
      "categories.id", "categories.name", "tags.value",
      "variants.id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.metadata", "variants.manage_inventory", "variants.allow_backorder",
      "variants.inventory_items.required_quantity",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ],
  })
  const product = data?.[0]
  if (!product) return null
  return {
    ...product,
    variants: (product.variants || []).map((variant: RecordData) => {
      const items = variant.inventory_items || []
      const available = items.map((item: RecordData) => {
        const levels = item.inventory?.location_levels || []
        const quantity = levels.reduce((sum: number, level: RecordData) => sum + Math.max(0,
          Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0)), 0)
        return Math.floor(quantity / Math.max(1, Number(item.required_quantity) || 1))
      })
      return { ...variant, inventory_quantity: available.length ? Math.min(...available) : 0 }
    }),
  }
}

export async function syncProductToSearch(scope: SearchScope, id: string) {
  const product = await loadProductForSearch(scope, id)
  if (!product) {
    await deleteSearchDocument(id)
    return null
  }
  // Keep existing document mapping, publication gate and Meilisearch task waiting.
  await upsertProductToSearch(product)
  return product
}
