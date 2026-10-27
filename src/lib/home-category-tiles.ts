import type { MedusaCategory } from "./medusa"

/** Keep established department tiles and fill the row with real leaf departments. */
export function selectHomeCategories(categories: MedusaCategory[], limit = 8): MedusaCategory[] {
  const roots = categories.filter(category => category.id && category.handle
    && !(category.parent_category_id ?? category.parent_category?.id))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)
      || (a.title || a.name || "").localeCompare(b.title || b.name || ""))
  const seen = new Set<string>()
  return [...roots.filter(category => category.category_children?.length),
    ...roots.filter(category => !category.category_children?.length)]
    .filter(category => {
      if (seen.has(category.id)) return false
      seen.add(category.id)
      return true
    }).slice(0, limit)
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)
      || (a.title || a.name || "").localeCompare(b.title || b.name || ""))
}
