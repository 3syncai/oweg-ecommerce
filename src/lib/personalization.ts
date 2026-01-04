// Helpers for user preference normalization and ordering

export type PreferenceProfile = {
  categories: string[]
  productTypes: string[]
  brands: string[]
  lastUpdated?: string
  version?: number
}

function toArray(input: unknown): string[] {
  if (!input) return []
  if (Array.isArray(input)) return input.map((item) => (typeof item === "string" || typeof item === "number" ? String(item) : "")).filter(Boolean)
  if (typeof input === "string") return input.split(/[,;/|]+/g)
  return []
}

function normalizeValue(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim()
}

export function normalizePreferenceValues(input: unknown): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  toArray(input).forEach((raw) => {
    const normalized = normalizeValue(raw)
    if (!normalized) return
    const slug = buildPreferenceSlug(normalized)
    if (seen.has(slug)) return
    seen.add(slug)
    result.push(normalized)
  })
  return result
}

export function normalizePreferences(raw: unknown): PreferenceProfile | null {
  const source = (raw as { preferences?: unknown })?.preferences ?? raw
  const categories = normalizePreferenceValues((source as { categories?: unknown })?.categories)
  const productTypes = normalizePreferenceValues((source as { productTypes?: unknown })?.productTypes)
  const brands = normalizePreferenceValues((source as { brands?: unknown })?.brands)
  const lastUpdated = typeof (source as { lastUpdated?: unknown })?.lastUpdated === "string" ? (source as { lastUpdated?: string }).lastUpdated : undefined
  const versionRaw = (source as { version?: unknown })?.version
  const version = typeof versionRaw === "number" && Number.isFinite(versionRaw) ? versionRaw : undefined

  if (!categories.length && !productTypes.length && !brands.length && !lastUpdated && !version) {
    return { categories: [], productTypes: [], brands: [] }
  }

  return {
    categories,
    productTypes,
    brands,
    ...(lastUpdated ? { lastUpdated } : {}),
    ...(version !== undefined ? { version } : {}),
  }
}

export function hasAnyPreferences(prefs?: PreferenceProfile | null) {
  if (!prefs) return false
  return prefs.categories.length > 0 || prefs.productTypes.length > 0 || prefs.brands.length > 0
}

export function buildPreferenceSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function reorderByPreferences<T>(
  items: T[],
  pickLabel: (item: T) => string | undefined,
  preferredValues: string[]
): T[] {
  if (!items.length || !preferredValues.length) return items
  const prefSlugs = preferredValues.map(buildPreferenceSlug)
  const seenSlugs = new Set<string>()
  const prioritized: T[] = []
  prefSlugs.forEach((slug) => {
    const match = items.find((item) => {
      const label = pickLabel(item)
      if (!label) return false
      return buildPreferenceSlug(label) === slug
    })
    if (match) {
      seenSlugs.add(slug)
      prioritized.push(match)
    }
  })
  items.forEach((item) => {
    const label = pickLabel(item)
    if (label && seenSlugs.has(buildPreferenceSlug(label))) return
    prioritized.push(item)
  })
  return prioritized
}
