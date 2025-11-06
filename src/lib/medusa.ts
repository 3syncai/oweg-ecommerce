export type MedusaCategory = {
  id: string
  name?: string
  title?: string
  handle?: string
}

export type MedusaProduct = {
  id: string
  title: string
  thumbnail?: string | null
  images?: { url: string }[]
  categories?: Array<{ id: string; handle?: string; name?: string }>
  tags?: Array<{ id: string; value?: string; handle?: string }>
  variants?: Array<{
    id: string
    prices?: Array<{ amount: number; currency_code: string }>
  }>
  price?: {
    calculated_price?: number
    original_price?: number
  }
}

export type MedusaCollection = {
  id: string
  title?: string
  handle?: string
  created_at?: string
}

const MEDUSA_URL =
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_API_KEY ||
  ""

const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
  process.env.MEDUSA_SALES_CHANNEL_ID ||
  ""

function api(path: string, init?: RequestInit) {
  const base = MEDUSA_URL!.replace(/\/$/, "")
  const url = `${base}${path}`
  return fetch(url, {
    // Force server-side fetch when called from route handlers
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
      ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}),
      ...(init?.headers || {}),
    },
  })
}

export async function fetchCategories(): Promise<MedusaCategory[]> {
  const res = await api("/store/product-categories?limit=100")
  if (!res.ok) throw new Error(`Failed categories: ${res.status}`)
  const data = await res.json()
  // Support v1 ({ product_categories }) and v2 ({ categories }) shapes
  return (
    data.product_categories || data.categories || data || []
  ) as MedusaCategory[]
}

export async function fetchCollections(): Promise<MedusaCollection[]> {
  const res = await api("/store/collections?limit=200")
  if (!res.ok) throw new Error(`Failed collections: ${res.status}`)
  const data = await res.json()
  return (data.collections || data || []) as MedusaCollection[]
}

export async function findCategoryByTitleOrHandle(
  q: string
): Promise<MedusaCategory | undefined> {
  const norm = (s?: string) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")

  const targetSlug = norm(q)

  // Try direct handle query first (more reliable)
  try {
    const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    // Try array-style handle filter
    for (const url of [
      `${base}/store/product-categories?handle[]=${encodeURIComponent(targetSlug)}`,
      `${base}/store/product-categories?handle=${encodeURIComponent(targetSlug)}`,
      `${base}/store/product-categories?q=${encodeURIComponent(q)}`,
    ]) {
      const res = await fetch(url, { cache: "no-store", headers: { ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}) } })
      if (!res.ok) continue
      const data = await res.json()
      const arr = (data.product_categories || data.categories || []) as MedusaCategory[]
      if (Array.isArray(arr) && arr.length) return arr[0]
    }
  } catch {}

  const all = await fetchCategories()

  // Try exact by title or name
  let found = all.find(
    (c) => c.title?.toLowerCase() === q.toLowerCase() || c.name?.toLowerCase() === q.toLowerCase()
  )
  if (found) return found

  // Try by handle match
  found = all.find((c) => c.handle?.toLowerCase() === targetSlug)
  if (found) return found

  // Fuzzy by slugified title/name
  return all.find((c) => norm(c.title || c.name) === targetSlug)
}

export async function findCollectionByTitleOrHandle(
  q: string
): Promise<MedusaCollection | undefined> {
  const norm = (s?: string) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")

  const targetSlug = norm(q)

  // Try direct handle query first
  try {
    const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    for (const url of [
      `${base}/store/collections?handle[]=${encodeURIComponent(targetSlug)}`,
      `${base}/store/collections?handle=${encodeURIComponent(targetSlug)}`,
      `${base}/store/collections?q=${encodeURIComponent(q)}`,
    ]) {
      const res = await fetch(url, { cache: "no-store", headers: { ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}), ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}) } })
      if (!res.ok) continue
      const data = await res.json()
      const arr = (data.collections || data || []) as MedusaCollection[]
      if (Array.isArray(arr) && arr.length) return arr[0]
    }
  } catch {}

  const all = await fetchCollections()
  let found = all.find((c) => (c.title || "").toLowerCase() === q.toLowerCase())
  if (found) return found
  found = all.find((c) => (c.handle || "").toLowerCase() === targetSlug)
  if (found) return found
  return all.find((c) => norm(c.title) === targetSlug)
}

export async function searchProducts(params: {
  q: string
  limit?: number
  categoryId?: string
  collectionId?: string
}): Promise<MedusaProduct[]> {
  const sp = new URLSearchParams()
  sp.append("q", params.q)
  sp.append("limit", String(params.limit ?? 10))
  if (params.categoryId) sp.append("category_id", params.categoryId)
  if (params.collectionId) sp.append("collection_id", params.collectionId)
  const res = await api(`/store/products?${sp.toString()}`)
  if (!res.ok) throw new Error(`Failed search: ${res.status}`)
  const data = await res.json()
  return (data.products || data || []) as MedusaProduct[]
}

export async function fetchProductsByCategoryId(categoryId: string, limit = 20) {
  const base = `/store/products?limit=${encodeURIComponent(String(limit))}`
  const candidates = [
    `${base}&category_id[]=${encodeURIComponent(categoryId)}`,
    `${base}&category_id=${encodeURIComponent(categoryId)}`,
  ]

  let lastStatus: number | undefined
  for (const url of candidates) {
    const res = await api(url)
    lastStatus = res.status
    if (!res.ok) continue
    const data = await res.json()
    const items = (data.products || data || []) as MedusaProduct[]
    if (Array.isArray(items)) return items
  }
  throw new Error(`Failed products: ${lastStatus ?? "unknown"}`)
}

export async function fetchProductsByTag(tagValue: string, limit = 20) {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
  const wanted = norm(tagValue)

  // 1) Try direct tag filters first (some Medusa versions support these)
  const base = `/store/products?limit=${encodeURIComponent(String(limit))}`
  for (const url of [
    `${base}&tags[]=${encodeURIComponent(tagValue)}`,
    `${base}&tag=${encodeURIComponent(tagValue)}`,
  ]) {
    const res = await api(url)
    if (res.ok) {
      const data = await res.json()
      const items = (data.products || data || []) as MedusaProduct[]
      if (Array.isArray(items) && items.length) return items
    }
  }

  // 2) Resolve tag id via store product-tags endpoint, then filter by tag_id[]
  try {
    const tRes = await api(`/store/product-tags?q=${encodeURIComponent(tagValue)}`)
    if (tRes.ok) {
      const tData = await tRes.json()
      const tagsArr = (tData.product_tags || tData.tags || []) as Array<{ id: string; value?: string; handle?: string }>
      const match = tagsArr.find((t) => norm(t.value || t.handle || "") === wanted)
      if (match?.id) {
        for (const url of [
          `${base}&tag_id[]=${encodeURIComponent(match.id)}`,
          `${base}&tag_id=${encodeURIComponent(match.id)}`,
        ]) {
          const res = await api(url)
          if (res.ok) {
            const data = await res.json()
            const items = (data.products || data || []) as MedusaProduct[]
            if (Array.isArray(items) && items.length) return items
          }
        }
      }
    }
  } catch {}

  // 3) Fallback: fetch without expand and return first page (UI will still show products)
  const res = await api(`/store/products?limit=${encodeURIComponent(String(limit))}`)
  if (res.ok) {
    const data = await res.json()
    return (data.products || data || []) as MedusaProduct[]
  }
  throw new Error(`Failed products by tag`)
}

// Fetch whether a collection has at least one product in a given category
export async function hasProductsForCollectionCategory(
  collectionId: string,
  categoryId: string
): Promise<boolean> {
  const base = `/store/products?limit=1`
  for (const url of [
    `${base}&collection_id[]=${encodeURIComponent(collectionId)}&category_id[]=${encodeURIComponent(categoryId)}`,
    `${base}&collection_id=${encodeURIComponent(collectionId)}&category_id=${encodeURIComponent(categoryId)}`,
  ]) {
    const res = await api(url)
    if (!res.ok) continue
    const data = await res.json()
    const items = (data.products || data || []) as MedusaProduct[]
    if (Array.isArray(items) && items.length > 0) return true
  }
  return false
}

// List categories that actually contain products within a specific collection
export async function fetchCategoriesForCollection(collectionId: string): Promise<MedusaCategory[]> {
  const cats = await fetchCategories()
  const matches: MedusaCategory[] = []
  for (const c of cats) {
    try {
      if (!c?.id) continue
      const ok = await hasProductsForCollectionCategory(collectionId, c.id)
      if (ok) matches.push(c)
    } catch {}
  }
  return matches
}

export function toUiProduct(p: MedusaProduct) {
  // Try medusa price helpers first
  const calculated = p.price?.calculated_price
  const original = p.price?.original_price

  // Fallback to first variant price in minor units (e.g., cents/paise)
  const firstAmountMinor = p.variants?.[0]?.prices?.[0]?.amount
  const amountMajor =
    typeof calculated === "number"
      ? calculated
      : typeof firstAmountMinor === "number"
      ? firstAmountMinor / 100
      : undefined

  const originalMajor =
    typeof original === "number" && original > 0
      ? original
      : amountMajor

  const discount =
    amountMajor && originalMajor && originalMajor > amountMajor
      ? Math.round(((originalMajor - amountMajor) / originalMajor) * 100)
      : 0

  const image =
    p.thumbnail || p.images?.[0]?.url || "/placeholder.png"

  return {
    id: p.id,
    name: p.title,
    image,
    price: amountMajor || 0,
    mrp: originalMajor || amountMajor || 0,
    discount,
    limitedDeal: discount >= 20,
    variant_id: p.variants?.[0]?.id,
  }
}
