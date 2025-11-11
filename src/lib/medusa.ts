export type MedusaCategory = {
  id: string
  name?: string
  title?: string
  handle?: string
}

export type MedusaProduct = {
  id: string
  title: string
  subtitle?: string
  thumbnail?: string | null
  images?: { url: string }[]
  categories?: Array<{ id: string; handle?: string; name?: string }>
  tags?: Array<{ id: string; value?: string; handle?: string }>
  type?: { id: string; value?: string; handle?: string }
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

const DEFAULT_CURRENCY_CODE =
  (
    process.env.NEXT_PUBLIC_MEDUSA_CURRENCY_CODE ||
    process.env.MEDUSA_CURRENCY_CODE ||
    process.env.NEXT_PUBLIC_STORE_CURRENCY ||
    "inr"
  )
    .toLowerCase()
    .trim()

const COMMON_EXPAND = "variants,variants.prices,price"

type ProductFetchOptions = {
  includeType?: boolean
}

function createBaseSearchParams(
  limit: number,
  extras: Array<[string, string | undefined]> = []
) {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  for (const [key, value] of extras) {
    if (value !== undefined && value !== "") {
      params.append(key, value)
    }
  }
  return params
}

function cloneParams(params: URLSearchParams) {
  return new URLSearchParams(params.toString())
}

async function fetchStoreProducts(
  baseParams: URLSearchParams,
  options?: ProductFetchOptions
) {
  const attempts: URLSearchParams[] = []

  // Attempt 1: include expand + currency (if supported by backend)
  const advanced = cloneParams(baseParams)
  advanced.set(
    "expand",
    options?.includeType ? `${COMMON_EXPAND},type` : COMMON_EXPAND
  )
  if (DEFAULT_CURRENCY_CODE) {
    advanced.set("currency_code", DEFAULT_CURRENCY_CODE)
  }
  attempts.push(advanced)

  // Attempt 2: drop currency_code (some setups support expand but not currency)
  const expandOnly = cloneParams(baseParams)
  expandOnly.set(
    "expand",
    options?.includeType ? `${COMMON_EXPAND},type` : COMMON_EXPAND
  )
  attempts.push(expandOnly)

  // Final attempt: bare minimum parameters
  attempts.push(cloneParams(baseParams))

  let lastStatus: number | undefined
  let lastResponseBody: unknown

  for (const params of attempts) {
    const res = await api(`/store/products?${params.toString()}`)
    lastStatus = res.status
    if (res.ok) {
      const data = await res.json()
      return (data.products || data || []) as MedusaProduct[]
    }

    // Capture response body for troubleshooting but continue trying fallbacks
    try {
      lastResponseBody = await res.json()
    } catch {
      lastResponseBody = await res.text()
    }

    // Try the next attempt for 400/422 style validation errors, otherwise break
    if (![400, 401, 404, 422].includes(res.status)) {
      break
    }
  }

  throw new Error(
    `Failed products: ${lastStatus ?? "unknown"}${lastResponseBody ? ` ${JSON.stringify(lastResponseBody)}` : ""
    }`
  )
}

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
  const baseParams = createBaseSearchParams(params.limit ?? 10, [
    ["q", params.q],
    ["category_id", params.categoryId],
    ["collection_id", params.collectionId],
  ])
  return await fetchStoreProducts(baseParams)
}

export async function fetchProductsByCategoryId(categoryId: string, limit = 20) {
  const candidates = [
    createBaseSearchParams(limit, [["category_id[]", categoryId]]),
    createBaseSearchParams(limit, [["category_id", categoryId]]),
  ]

  let lastError: Error | undefined
  for (const params of candidates) {
    try {
      const items = await fetchStoreProducts(params)
      if (Array.isArray(items)) return items
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error("Failed products")
}

export async function fetchProductsByTag(tagValue: string, limit = 20) {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
  const wanted = norm(tagValue)

  // 1) Try direct tag filters first (some Medusa versions support these)
  for (const url of [
    createBaseSearchParams(limit, [["tags[]", tagValue]]),
    createBaseSearchParams(limit, [["tag", tagValue]]),
  ]) {
    try {
      const items = await fetchStoreProducts(url)
      if (Array.isArray(items) && items.length) return items
    } catch {
      // move to next fallback
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
          createBaseSearchParams(limit, [["tag_id[]", match.id]]),
          createBaseSearchParams(limit, [["tag_id", match.id]]),
        ]) {
          try {
            const items = await fetchStoreProducts(url)
            if (Array.isArray(items) && items.length) return items
          } catch {
            // continue to next fallback
          }
        }
      }
    }
  } catch {}

  // 3) Fallback: fetch without expand and return first page (UI will still show products)
  return await fetchStoreProducts(createBaseSearchParams(limit))
}

export type MedusaProductType = {
  id: string
  value?: string
  handle?: string
}

export async function fetchProductsByType(typeValue: string, limit = 20) {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
  const wanted = norm(typeValue)
  const candidates = (() => {
    const set = new Set<string>()
    set.add(wanted)
    if (wanted.endsWith("s")) set.add(wanted.slice(0, -1))
    else set.add(`${wanted}s`)
    if (wanted.endsWith("ies")) set.add(wanted.slice(0, -3) + "y")
    if (wanted.endsWith("y")) set.add(wanted.slice(0, -1) + "ies")
    if (wanted.endsWith("es")) set.add(wanted.slice(0, -2))
    return set
  })()
  const matches = (val?: string) => candidates.has(norm(val || ""))

  // 1) Try resolving type id via store product-types endpoint (if available)
  try {
    const tRes = await api(`/store/product-types?q=${encodeURIComponent(typeValue)}`)
    if (tRes.ok) {
      const tData = await tRes.json()
      const typesArr = (tData.product_types || tData.types || []) as MedusaProductType[]
      const match = typesArr.find((t) => matches(t.value || t.handle || ""))
      if (match?.id) {
        for (const url of [
          createBaseSearchParams(limit, [["type_id[]", match.id]]),
          createBaseSearchParams(limit, [["type_id", match.id]]),
        ]) {
          try {
            const items = await fetchStoreProducts(url, { includeType: true })
            if (Array.isArray(items) && items.length) return items
          } catch {
            // try next candidate or fallback
          }
        }
      }
    }
  } catch {}

  // 2) Fallback: expand type and filter client-side (best effort)
  try {
    const items = await fetchStoreProducts(
      createBaseSearchParams(Math.max(limit, 50)),
      { includeType: true }
    )
    const filtered = items.filter((p) => matches(p.type?.value || p.type?.handle || ""))
    if (filtered.length) return filtered.slice(0, limit)
  } catch {}

  // 3) Last fallback: return empty to avoid 500s; route can try category fallback
  return []
}

// Fetch whether a collection has at least one product in a given category
export async function hasProductsForCollectionCategory(
  collectionId: string,
  categoryId: string
): Promise<boolean> {
  for (const params of [
    createBaseSearchParams(1, [
      ["collection_id[]", collectionId],
      ["category_id[]", categoryId],
    ]),
    createBaseSearchParams(1, [
      ["collection_id", collectionId],
      ["category_id", categoryId],
    ]),
  ]) {
    try {
      const items = await fetchStoreProducts(params)
      if (Array.isArray(items) && items.length > 0) return true
    } catch {
      // try next combination
    }
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

export function toUiProduct(
  p: MedusaProduct,
  override?: { price?: number; mrp?: number }
) {
  // Validate product has required fields
  if (!p?.id || !p?.title) {
    console.warn("Incomplete product data:", p)
    return {
      id: p?.id || "unknown",
      name: p?.title || "Unnamed Product",
      image: p?.thumbnail || p?.images?.[0]?.url || "/oweg_logo.png",
      price: 0,
      mrp: 0,
      discount: 0,
      limitedDeal: false,
      variant_id: p?.variants?.[0]?.id,
    }
  }

  // Try medusa price helpers first
  const calculated = p.price?.calculated_price
  const original = p.price?.original_price

  // Fallback to first variant price in minor units (e.g., cents/paise)
  const firstAmountMinor = p.variants?.[0]?.prices?.[0]?.amount
  const amountMajor =
    override?.price ??
    (typeof calculated === "number"
      ? calculated
      : typeof firstAmountMinor === "number"
      ? firstAmountMinor / 100
      : undefined)

  const originalMajor =
    override?.mrp ??
    (typeof original === "number" && original > 0
      ? original
      : amountMajor)

  const discount =
    amountMajor && originalMajor && originalMajor > amountMajor
      ? Math.round(((originalMajor - amountMajor) / originalMajor) * 100)
      : 0

  const image =
    p.thumbnail || p.images?.[0]?.url || "/oweg_logo.png"

  return {
    id: p.id,
    name: p.title,
    image,
    price: amountMajor ?? 0,
    mrp: originalMajor ?? amountMajor ?? 0,
    discount,
    limitedDeal: discount >= 20,
    variant_id: p.variants?.[0]?.id,
  }
}
