// Removed OpenCart MySQL dependency - now using Medusa prices only

export type MedusaCategory = {
  id: string
  name?: string
  title?: string
  handle?: string
  parent_category_id?: string | null
  parent_category?: { id?: string | null } | null
  category_children?: MedusaCategory[]
}

export type MedusaProduct = {
  id: string
  title: string
  subtitle?: string
  description?: string
  handle?: string
  thumbnail?: string | null
  images?: { url: string }[]
  categories?: Array<{ id: string; handle?: string; name?: string; title?: string }>
  tags?: Array<{ id: string; value?: string; handle?: string }>
  type?: { id: string; value?: string; handle?: string }
  collection?: { id?: string; title?: string; handle?: string }
  weight?: number | null
  length?: number | null
  height?: number | null
  width?: number | null
  variants?: Array<{
    id: string
    title?: string
    inventory_quantity?: number
    options?: Array<{ id: string; value?: string; option_id?: string }>
    prices?: Array<{ amount: number; currency_code: string }>
    calculated_price?: {
      calculated_amount?: number
      original_amount?: number
      currency_code?: string
    }
    weight?: number | null
    length?: number | null
    height?: number | null
    width?: number | null
    metadata?: Record<string, unknown> | null
  }>
  price?: {
    calculated_price?: number
    original_price?: number
  }
  metadata?: Record<string, unknown>
}

export type DetailedProduct = {
  id: string
  title: string
  subtitle?: string
  description?: string
  handle?: string
  price: number
  mrp: number
  discount: number
  currency: string
  images: string[]
  thumbnail?: string
  variant_id?: string
  variants: Array<{
    id: string
    title?: string
    inventory_quantity?: number
    weight?: number | null
    length?: number | null
    height?: number | null
    width?: number | null
    metadata?: Record<string, unknown> | null
  }>
  categories: Array<{ id: string; title: string; handle?: string }>
  tags: string[]
  type?: string
  collection?: { id?: string; title?: string; handle?: string } | null
  primaryCategoryId?: string
  highlights: string[]
  metadata?: Record<string, unknown> | null
}

// PriceOverride type removed - using Medusa prices only

const PRODUCT_DETAIL_CACHE = new Map<string, { expires: number; value: DetailedProduct | null }>()
const DETAIL_CACHE_TTL_MS = 1000 * 60 * 5

const ADMIN_TOKEN =
  process.env.MEDUSA_ADMIN_API_KEY ||
  process.env.MEDUSA_ADMIN_TOKEN ||
  process.env.MEDUSA_ADMIN_BASIC ||
  ""
const ADMIN_AUTH_SCHEME = (process.env.MEDUSA_ADMIN_AUTH_SCHEME || "bearer").toLowerCase()

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

function getPublishableKey() {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY ||
    ""
  )
}

function getSalesChannelId() {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
    process.env.MEDUSA_SALES_CHANNEL_ID ||
    ""
  )
}

const DEFAULT_CURRENCY_CODE =
  (
    process.env.NEXT_PUBLIC_MEDUSA_CURRENCY_CODE ||
    process.env.MEDUSA_CURRENCY_CODE ||
    process.env.NEXT_PUBLIC_STORE_CURRENCY ||
    "inr"
  )
    .toLowerCase()
    .trim()

const PRODUCT_LIST_FIELDS = [
  "id",
  "title",
  "subtitle",
  "handle",
  "thumbnail",
  "images.url",
  "collection.id",
  "collection.title",
  "categories.id",
  "categories.title",
  "tags.id",
  "tags.value",
  "type.id",
  "type.value",
  "variants.id",
  "variants.prices.amount",
  "variants.calculated_price",
  "variants.inventory_quantity",
  "metadata",
  "price",
].join(",")

type ProductFetchOptions = {
  includeType?: boolean
}

function createBaseSearchParams(
  limit: number,
  extras: Array<[string, string | undefined]> = []
) {
  const normalizedLimit = Math.max(1, Math.min(limit, 60))
  const params = new URLSearchParams()
  params.set("limit", String(normalizedLimit))
  params.set("fields", PRODUCT_LIST_FIELDS)
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

  // Medusa v2: Just use fields, no expand or currency_code parameters
  const simple = cloneParams(baseParams)
  if (!simple.has("fields")) {
    simple.set("fields", PRODUCT_LIST_FIELDS)
  }
  attempts.push(simple)

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
  const publishableKey = getPublishableKey()
  const salesChannelId = getSalesChannelId()
  return fetch(url, {
    // Force server-side fetch when called from route handlers
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      ...(salesChannelId ? { "x-sales-channel-id": salesChannelId } : {}),
      ...(init?.headers || {}),
    },
  })
}

export async function fetchCategories(): Promise<MedusaCategory[]> {
  const params = new URLSearchParams({
    limit: "100",
    include_descendants_tree: "true",
  })
  const res = await api(`/store/product-categories?${params.toString()}`)
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

  const raw = (q || "").trim()
  const lowerRaw = raw.toLowerCase()
  const targetSlug = norm(raw)
  const handleCandidates = Array.from(new Set([raw, lowerRaw, targetSlug].filter(Boolean)))

  // Try direct handle query first (more reliable)
  try {
    const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    // Try array-style handle filter for multiple candidate representations
    const urls: string[] = []
    handleCandidates.forEach((candidate) => {
      urls.push(`${base}/store/product-categories?handle[]=${encodeURIComponent(candidate)}`)
      urls.push(`${base}/store/product-categories?handle=${encodeURIComponent(candidate)}`)
    })
    urls.push(`${base}/store/product-categories?q=${encodeURIComponent(raw)}`)
    for (const url of urls) {
      const pk = getPublishableKey()
      const res = await fetch(url, {
        cache: "no-store",
        headers: { ...(pk ? { "x-publishable-api-key": pk } : {}) },
      })
      if (!res.ok) continue
      const data = await res.json()
      const arr = (data.product_categories || data.categories || []) as MedusaCategory[]
      if (Array.isArray(arr) && arr.length) return arr[0]
    }
  } catch (err) {
    console.warn("findCategoryByTitleOrHandle direct lookup failed", err)
  }

  const all = await fetchCategories()

  // Try exact by title or name
  let found = all.find(
    (c) => c.title?.toLowerCase() === q.toLowerCase() || c.name?.toLowerCase() === q.toLowerCase()
  )
  if (found) return found

  // Try by handle match
  found = all.find((c) => {
    const handle = c.handle?.toLowerCase()
    return handle === lowerRaw || handle === targetSlug
  })
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
      const pk = getPublishableKey()
      const sc = getSalesChannelId()
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          ...(pk ? { "x-publishable-api-key": pk } : {}),
          ...(sc ? { "x-sales-channel-id": sc } : {}),
        },
      })
      if (!res.ok) continue
      const data = await res.json()
      const arr = (data.collections || data || []) as MedusaCollection[]
      if (Array.isArray(arr) && arr.length) return arr[0]
    }
  } catch (err) {
    console.warn("findCollectionByTitleOrHandle direct lookup failed", err)
  }

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

export async function fetchProductsByCollectionId(collectionId: string, limit = 20) {
  const candidates = [
    createBaseSearchParams(limit, [["collection_id[]", collectionId]]),
    createBaseSearchParams(limit, [["collection_id", collectionId]]),
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
  throw lastError ?? new Error("Failed products by collection")
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
  } catch (err) {
    console.warn("fetchProductsByTag tag lookup failed", err)
  }

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
  } catch (err) {
    console.warn("fetchProductsByType type lookup failed", err)
  }

  // 2) Fallback: expand type and filter client-side (best effort)
  try {
    const items = await fetchStoreProducts(
      createBaseSearchParams(Math.max(limit, 50)),
      { includeType: true }
    )
    const filtered = items.filter((p) => matches(p.type?.value || p.type?.handle || ""))
    if (filtered.length) return filtered.slice(0, limit)
  } catch (err) {
    console.warn("fetchProductsByType expand fallback failed", err)
  }

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
    } catch (err) {
      console.warn("fetchCategoriesForCollection check failed", { collectionId, categoryId: c.id, err })
    }
  }
  return matches
}

function resolveMajorFromMinor(amount?: number | null) {
  if (typeof amount !== "number") return undefined
  // Medusa v2 stores prices in major unit (rupees), not minor unit (paise)
  // No conversion needed - return the amount as-is
  return amount
}

function collectProductImages(p: MedusaProduct) {
  const urls = [
    p.thumbnail,
    ...(p.images?.map((img) => img.url) || []),
  ].filter((url): url is string => !!url)
  return Array.from(new Set(urls))
}

export function toDetailedProduct(
  p: MedusaProduct
): DetailedProduct {
  const { amountMajor, originalMajor, discount } = computeUiPrice(p)
  const categories =
    p.categories?.map((cat) => ({
      id: cat.id,
      title: (cat.name || cat.title || "").toString() || "Category",
      handle: cat.handle,
    })) || []

  const tags = (p.tags || [])
    .map((t) => t.value || t.handle || "")
    .filter((v): v is string => !!v)

  const highlights = tags.length
    ? tags
    : categories.map((c) => c.title).filter(Boolean)

  const primaryVariant = p.variants?.[0]
  const normalizedMetadata: Record<string, unknown> = { ...(p.metadata || {}) }

  const mergeMetadata = (source?: Record<string, unknown> | null) => {
    if (!source) return
    Object.entries(source).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        normalizedMetadata[key] === undefined
      ) {
        normalizedMetadata[key] = value
      }
    })
  }

  const measurementValue = (
    ...values: Array<number | null | undefined>
  ): number | undefined => {
    for (const val of values) {
      if (val !== undefined && val !== null && Number.isFinite(val)) {
        return val
      }
    }
    return undefined
  }

  const registerMeasurement = (keys: string[], value?: number) => {
    if (value === undefined) return
    keys.forEach((key) => {
      if (normalizedMetadata[key] === undefined) {
        normalizedMetadata[key] = value
      }
    })
  }

  registerMeasurement(
    ["weight_kg", "weight"],
    measurementValue(p.weight, primaryVariant?.weight)
  )
  registerMeasurement(
    ["height_cm", "height"],
    measurementValue(p.height, primaryVariant?.height)
  )
  registerMeasurement(
    ["width_cm", "width"],
    measurementValue(p.width, primaryVariant?.width)
  )
  registerMeasurement(
    ["length_cm", "length"],
    measurementValue(p.length, primaryVariant?.length)
  )

  mergeMetadata(primaryVariant?.metadata || null)

  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    handle: p.handle,
    price: amountMajor ?? 0,
    mrp: originalMajor ?? amountMajor ?? 0,
    discount,
    currency: DEFAULT_CURRENCY_CODE.toUpperCase(),
    images: collectProductImages(p),
    thumbnail: p.thumbnail || undefined,
    variant_id: p.variants?.[0]?.id,
    variants:
      p.variants?.map((v) => ({
        id: v.id,
        title: v.title,
        inventory_quantity: v.inventory_quantity,
        weight: v.weight ?? null,
        length: v.length ?? null,
        height: v.height ?? null,
        width: v.width ?? null,
        metadata: v.metadata || null,
      })) || [],
    categories,
    tags,
    type: p.type?.value || p.type?.handle,
    collection: p.collection
      ? {
          id: p.collection.id,
          title: p.collection.title,
          handle: p.collection.handle,
        }
      : null,
    primaryCategoryId: categories[0]?.id,
    highlights,
    metadata:
      Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : null,
  }
}

function computeUiPrice(p: MedusaProduct) {
  const calculated = p.price?.calculated_price
  const original = p.price?.original_price
  const firstAmountMinor = p.variants?.[0]?.prices?.[0]?.amount
  
  const amountMajor =
    typeof calculated === "number"
      ? calculated
      : resolveMajorFromMinor(firstAmountMinor)

  const originalMajor =
    typeof original === "number" && original > 0
      ? original
      : amountMajor

  const discount =
    amountMajor && originalMajor && originalMajor > amountMajor
      ? Math.round(((originalMajor - amountMajor) / originalMajor) * 100)
      : 0

  return { amountMajor, originalMajor, discount }
}

export function toUiProduct(p: MedusaProduct) {
  if (!p?.id || !p?.title) {
    console.warn("Incomplete product data:", p)
  }

  const { amountMajor, originalMajor, discount } = computeUiPrice(p)
  const image = collectProductImages(p)[0] || "/oweg_logo.png"
  const metadata = (p.metadata || {}) as Record<string, unknown>

  return {
    id: p?.id || "unknown",
    name: p?.title || "Unnamed Product",
    image,
    price: amountMajor ?? 0,
    mrp: originalMajor ?? amountMajor ?? 0,
    discount,
    limitedDeal: discount >= 20,
    opencartId: metadata["opencart_id"] as string | number | undefined,
    variant_id: p?.variants?.[0]?.id,
    handle: p?.handle,
    category_ids: p?.categories?.map((c) => c.id).filter((id): id is string => !!id) || [],
  }
}

export async function fetchProductDetail(
  idOrHandle: string
): Promise<DetailedProduct | null> {
  const target = idOrHandle?.trim()
  if (!target) return null

  const cacheKey = target.toLowerCase()
  const cached = PRODUCT_DETAIL_CACHE.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.value
  }

  // Medusa v2: no expand or currency parameters
  const paramVariants: URLSearchParams[] = [new URLSearchParams()]

  const attempts: string[] = []
  const seen = new Set<string>()
  const registerAttempt = (path: string) => {
    if (!seen.has(path)) {
      seen.add(path)
      attempts.push(path)
    }
  }

  const encodedTarget = encodeURIComponent(target)
  for (const params of paramVariants) {
    const query = params.toString()
    registerAttempt(
      `/store/products/${encodedTarget}${query ? `?${query}` : ""}`
    )

    const baseList = new URLSearchParams(params)
    baseList.set("limit", "1")

    const handleParams = new URLSearchParams(baseList)
    handleParams.set("handle", target)
    registerAttempt(`/store/products?${handleParams.toString()}`)

    const handleArrayParams = new URLSearchParams(baseList)
    handleArrayParams.append("handle[]", target)
    registerAttempt(`/store/products?${handleArrayParams.toString()}`)

    const idsParam = new URLSearchParams(baseList)
    idsParam.append("ids[]", target)
    registerAttempt(`/store/products?${idsParam.toString()}`)

    const idParam = new URLSearchParams(baseList)
    idParam.set("id", target)
    registerAttempt(`/store/products?${idParam.toString()}`)
  }

  // Last resort: rely on free-text search without expand/currency filters.
  const searchParams = new URLSearchParams()
  searchParams.set("limit", "1")
  searchParams.set("q", target)
  registerAttempt(`/store/products?${searchParams.toString()}`)

  for (const path of attempts) {
    try {
      const res = await api(path)
      if (!res.ok) continue
      const data = await res.json()
      const product = (data.product || data.products?.[0] || data) as
        | MedusaProduct
        | undefined
      if (product?.id) {
        // Fetch admin price as fallback if no calculated price available
        let adminPrice: number | undefined
        if (!product?.price?.calculated_price && !product?.variants?.[0]?.prices?.length) {
          adminPrice = await fetchAdminProductPrice(product.id)
        }

<<<<<<< HEAD
        // Admin price is only used if Medusa has no price data at all
        // Prices are taken from Medusa Admin, not OpenCart
        const detailed = toDetailedProduct(product)
        
        // If Medusa has no price and admin API returned a price, use it
        if (adminPrice !== undefined && detailed.price === 0) {
          detailed.price = adminPrice
          detailed.mrp = adminPrice
        }
=======
        const fallbackOverride =
          adminPrice !== undefined
            ? {
                price: resolveMajorFromMinor(adminPrice),
                mrp: resolveMajorFromMinor(adminPrice),
              }
            : undefined
>>>>>>> master

        PRODUCT_DETAIL_CACHE.set(cacheKey, {
          expires: Date.now() + DETAIL_CACHE_TTL_MS,
          value: detailed,
        })
        return detailed
      }
    } catch {
      // try next path
    }
  }
  PRODUCT_DETAIL_CACHE.set(cacheKey, {
    expires: Date.now() + DETAIL_CACHE_TTL_MS,
    value: null,
  })
  return null
}

async function fetchAdminProductPrice(productId: string): Promise<number | undefined> {
  if (!ADMIN_TOKEN) return undefined
  try {
    const base = MEDUSA_URL!.replace(/\/$/, "")
    const res = await fetch(`${base}/admin/products/${encodeURIComponent(productId)}`, {
      cache: "no-store",
      headers: {
        Authorization:
          ADMIN_AUTH_SCHEME === "basic" ? `Basic ${ADMIN_TOKEN}` : `Bearer ${ADMIN_TOKEN}`,
      },
    })
    if (!res.ok) return undefined
    const data = await res.json()
    const variants = data?.product?.variants
    const prices = Array.isArray(variants?.[0]?.prices) ? variants[0].prices : []
    const amount = prices?.[0]?.amount
    if (typeof amount === "number" && Number.isFinite(amount)) return resolveMajorFromMinor(amount)
    return undefined
  } catch (err) {
    console.warn("fetchAdminProductPrice failed", err)
    return undefined
  }
}

// fetchPriceOverrideForName function removed - using Medusa prices only
