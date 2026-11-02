export type SearchFilters = { priceMin?: number; priceMax?: number; minRating?: number; brands?: string[] }

export function parseSearchFilters(params: URLSearchParams): SearchFilters {
  const number = (key: string) => {
    const raw = params.get(key)
    if (raw === null || raw.trim() === '') return undefined
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}`)
    return value
  }
  const filters = { priceMin: number('priceMin'), priceMax: number('priceMax'), minRating: number('minRating'),
    brands: params.getAll('brand').map(b => b.trim()).filter(Boolean).slice(0, 8) }
  if ((filters.minRating ?? 0) > 5 || (filters.priceMin !== undefined && filters.priceMax !== undefined && filters.priceMin > filters.priceMax)) throw new Error('Invalid filter range')
  return filters
}

export function hasSearchFilters(filters: SearchFilters) {
  return filters.priceMin !== undefined || filters.priceMax !== undefined || filters.minRating !== undefined || Boolean(filters.brands?.length)
}

export function quoteSearchFilter(value: string) { return JSON.stringify(value) }

export function searchFilterExpressions(filters: SearchFilters): string[] {
  return [
    ...(filters.priceMin !== undefined ? [`price >= ${filters.priceMin}`] : []),
    ...(filters.priceMax !== undefined ? [`price <= ${filters.priceMax}`] : []),
    ...(filters.minRating !== undefined ? [`rating >= ${filters.minRating}`] : []),
    ...(filters.brands?.length ? [`(${filters.brands.map(b => `brand = ${quoteSearchFilter(b)}`).join(' OR ')})`] : []),
  ]
}

/** Medusa's q is a substring lookup; a multiword query need not be contiguous in a title. */
export function searchRecallTerm(query: string) {
  return query.trim().split(/\s+/).filter(token => token.length >= 2).at(-1) || query
}

export function matchesSearchWords(title: string, query: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
  return query.toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => normalized.includes(word))
}

export function matchesSearchFilters(product: { price?: number; rating?: number; brand?: string }, filters: SearchFilters) {
  if (filters.priceMin !== undefined && (product.price === undefined || product.price < filters.priceMin)) return false
  if (filters.priceMax !== undefined && (product.price === undefined || product.price > filters.priceMax)) return false
  if (filters.minRating !== undefined && (product.rating === undefined || product.rating < filters.minRating)) return false
  return !filters.brands?.length || filters.brands.includes(product.brand || '')
}
