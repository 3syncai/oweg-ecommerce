// Removed OpenCart MySQL dependency - now using Medusa prices only

import { getPriceListPrices } from "./price-lists"

export type MedusaCategory = {
  id: string
  name?: string
  title?: string
  handle?: string
  rank?: number
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
  options?: Array<{
    id: string
    title?: string
    values?: Array<{ id?: string; value?: string }>
  }>
  variants?: Array<{
    id: string
    title?: string
    inventory_quantity?: number
    manage_inventory?: boolean
    allow_backorder?: boolean
    options?: Array<{
      id: string
      value?: string
      option_id?: string
      option?: { id?: string; title?: string }
    }>
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
  colorImages?: Record<string, string[]>
  primaryVisualOption?: string
  options: Array<{
    id: string
    title: string
    values: string[]
  }>
  variants: Array<{
    id: string
    title?: string
    inventory_quantity?: number
    manage_inventory?: boolean
    allow_backorder?: boolean
    weight?: number | null
    length?: number | null
    height?: number | null
    width?: number | null
    metadata?: Record<string, unknown> | null
    options: Record<string, string>
    price: number
    mrp: number
    discount: number
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
  metadata?: Record<string, unknown> | null
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
  "description",
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
  "variants.title",
  "variants.prices.amount",
  "variants.calculated_price",
  "variants.inventory_quantity",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.metadata",
  "variants.options.id",
  "variants.options.value",
  "variants.options.option_id",
  "variants.options.option.title",
  "options.id",
  "options.title",
  "options.values.value",
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
  _options?: ProductFetchOptions
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

function api(path: string, init?: RequestInit & { revalidate?: number }) {
  const base = MEDUSA_URL!.replace(/\/$/, "")
  const url = `${base}${path}`
  const publishableKey = getPublishableKey()
  const salesChannelId = getSalesChannelId()
  const { revalidate, ...requestInit } = init ?? {}
  return fetch(url, {
    ...(revalidate !== undefined
      ? { next: { revalidate } }
      : { cache: "no-store" }),
    ...requestInit,
    headers: {
      "content-type": "application/json",
      ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      ...(salesChannelId ? { "x-sales-channel-id": salesChannelId } : {}),
      ...(requestInit.headers || {}),
    },
  })
}

export async function fetchCategories(options?: {
  revalidate?: number;
}): Promise<MedusaCategory[]> {
  const limit = 200
  const collected: MedusaCategory[] = []
  for (let offset = 0; offset < 2000; offset += limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      include_descendants_tree: "true",
      order: "rank",
    })
    const res = await api(
      `/store/product-categories?${params.toString()}`,
      options?.revalidate !== undefined ? { revalidate: options.revalidate } : undefined,
    )
    if (!res.ok) throw new Error(`Failed categories: ${res.status}`)
    const data = await res.json()
    // Support v1 ({ product_categories }) and v2 ({ categories }) shapes
    const page = (data.product_categories || data.categories || data || []) as MedusaCategory[]
    if (!Array.isArray(page) || page.length === 0) break
    collected.push(...page)
    if (page.length < limit) break
  }
  return collected
}

export async function fetchCollections(): Promise<MedusaCollection[]> {
  const res = await api("/store/brand-collections")
  if (!res.ok) {
    const fallback = await api("/store/collections?limit=200")
    if (!fallback.ok) throw new Error(`Failed collections: ${fallback.status}`)
    const fallbackData = await fallback.json()
    return (fallbackData.collections || fallbackData || []) as MedusaCollection[]
  }
  const data = await res.json()
  const rows = (data.collections || []) as Array<{
    id: string
    title?: string
    handle?: string
    brand_logo_url?: string
    brand_logo_scale?: number
    metadata?: Record<string, unknown>
  }>

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    metadata: {
      ...(row.metadata || {}),
      brand_logo_url: row.brand_logo_url || row.metadata?.brand_logo_url,
      brand_logo_scale: row.brand_logo_scale ?? row.metadata?.brand_logo_scale,
    },
  }))
}

export async function fetchFeaturedBrands(): Promise<MedusaCollection[]> {
  const res = await api("/store/featured-brands")
  if (!res.ok) throw new Error(`Failed featured brands: ${res.status}`)
  const data = await res.json()
  const rows = (data.collections || []) as Array<{
    id: string
    title?: string
    handle?: string
    brand_logo_url?: string
    brand_logo_scale?: number
    metadata?: Record<string, unknown>
  }>

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    metadata: {
      ...(row.metadata || {}),
      brand_logo_url: row.brand_logo_url || row.metadata?.brand_logo_url,
      brand_logo_scale: row.brand_logo_scale ?? row.metadata?.brand_logo_scale,
      featured_on_homepage: true,
    },
  }))
}

export type MegaMenuBanner = {
  id: string
  image_url: string
  link_url: string
  alt_text?: string
  open_in_new_tab?: boolean
  priority?: number
}

export async function fetchMegaMenuBanners(handle: string): Promise<MegaMenuBanner[]> {
  const res = await api(`/store/mega-menu-banners?handle=${encodeURIComponent(handle)}`)
  if (!res.ok) throw new Error(`Failed mega menu banners: ${res.status}`)
  const data = await res.json()
  return (data.banners || []) as MegaMenuBanner[]
}

export async function fetchProductTypes(): Promise<MedusaProductType[]> {
  const res = await api("/store/product-types?limit=200")
  if (!res.ok) throw new Error(`Failed product types: ${res.status}`)
  const data = await res.json()
  return (data.product_types || data.types || data || []) as MedusaProductType[]
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

function dedupeMedusaProducts(products: MedusaProduct[]): MedusaProduct[] {
  const seen = new Set<string>()
  const out: MedusaProduct[] = []
  for (const product of products) {
    if (!product?.id || seen.has(product.id)) continue
    seen.add(product.id)
    out.push(product)
  }
  return out
}

export function collectDescendantCategoryIds(category: MedusaCategory): string[] {
  const ids: string[] = []
  if (category.id) ids.push(category.id)
  for (const child of category.category_children || []) {
    ids.push(...collectDescendantCategoryIds(child))
  }
  return ids
}

export async function fetchCategoryById(categoryId: string): Promise<MedusaCategory | undefined> {
  const params = new URLSearchParams({
    id: categoryId,
    include_descendants_tree: "true",
  })
  const res = await api(`/store/product-categories?${params.toString()}`)
  if (!res.ok) return undefined
  const data = await res.json()
  const arr = (data.product_categories || data.categories || []) as MedusaCategory[]
  return Array.isArray(arr) && arr.length ? arr[0] : undefined
}

export async function fetchProductsByCategoryIds(
  categoryIds: string[],
  limit = 20
): Promise<MedusaProduct[]> {
  const uniqueIds = Array.from(new Set(categoryIds.filter(Boolean)))
  if (uniqueIds.length === 0) return []
  if (uniqueIds.length === 1) return fetchProductsByCategoryId(uniqueIds[0], limit)

  const extras: Array<[string, string]> = uniqueIds.map((id) => ["category_id[]", id])
  const candidates = [
    createBaseSearchParams(limit, extras),
    createBaseSearchParams(limit, uniqueIds.map((id) => ["category_id", id] as [string, string])),
  ]

  for (const params of candidates) {
    try {
      const items = await fetchStoreProducts(params)
      if (Array.isArray(items) && items.length) {
        return dedupeMedusaProducts(items).slice(0, limit)
      }
    } catch {
      // try next candidate / fallback below
    }
  }

  const perCategoryLimit = Math.min(60, Math.max(limit, Math.ceil(limit / uniqueIds.length)))
  const batches = await Promise.all(
    uniqueIds.map((id) =>
      fetchProductsByCategoryId(id, perCategoryLimit).catch(() => [] as MedusaProduct[])
    )
  )
  return dedupeMedusaProducts(batches.flat()).slice(0, limit)
}

export async function fetchProductsByCategoryId(
  categoryId: string,
  limit = 20,
  options?: { includeSubcategories?: boolean }
): Promise<MedusaProduct[]> {
  if (options?.includeSubcategories) {
    const category = (await fetchCategoryById(categoryId)) || undefined
    const categoryIds = category ? collectDescendantCategoryIds(category) : [categoryId]
    return fetchProductsByCategoryIds(categoryIds, limit)
  }

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

  // No products found for this tag — return empty rather than leaking unfiltered results
  return []
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
  if (typeof amount !== "number" || amount === null || amount === undefined) return undefined
  // Database stores prices in major units (Rupees) already
  // No conversion needed - return as-is
  return amount
}

function collectProductImages(p: MedusaProduct) {
  const urls = [
    p.thumbnail,
    ...(p.images?.map((img) => img.url) || []),
  ].filter((url): url is string => !!url)
  return Array.from(new Set(urls))
}

export function resolveColorImageUrls(
  colorValue: string,
  colorImages?: Record<string, string[]>
): string[] | undefined {
  if (!colorValue?.trim() || !colorImages) return undefined
  const trimmed = colorValue.trim()
  if (colorImages[trimmed]?.length) return colorImages[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [key, urls] of Object.entries(colorImages)) {
    if (key.toLowerCase() === lower && urls.length) return urls
  }
  return undefined
}

export function toDetailedProduct(
  p: MedusaProduct
): DetailedProduct {
  const { amountMajor, originalMajor, discount } = computeUiPrice(p)
  const placeholderCategoryValues = new Set(["category", "categories", "uncategorized", "default"])
  const categories =
    p.categories?.map((cat) => ({
      id: cat.id,
      title: (cat.title || cat.name || "").toString() || "Category",
      handle: cat.handle,
    }))
      .filter((cat) => !placeholderCategoryValues.has(cat.title.trim().toLowerCase())) || []

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

  const metaRecord = normalizedMetadata as Record<string, unknown>
  const colorImages: Record<string, string[]> = {}
  const rawColorImages = metaRecord.color_images
  if (rawColorImages && typeof rawColorImages === "object" && !Array.isArray(rawColorImages)) {
    for (const [key, value] of Object.entries(rawColorImages as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const urls = value.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      )
      if (urls.length) colorImages[key] = urls
    }
  }

  const productOptions =
    p.options?.map((opt) => ({
      id: opt.id,
      title: (opt.title || "Option").trim(),
      values: Array.from(
        new Set(
          (opt.values || [])
            .map((entry) => (entry.value || "").trim())
            .filter(Boolean)
        )
      ),
    })) || []

  const optionTitleById = new Map(
    productOptions.map((opt) => [opt.id, opt.title])
  )

  const mappedVariants =
    p.variants?.map((variant) => {
      const optionValues: Record<string, string> = {}
      for (const entry of variant.options || []) {
        const title =
          entry.option?.title ||
          (entry.option_id ? optionTitleById.get(entry.option_id) : undefined) ||
          "Option"
        const value = (entry.value || "").trim()
        if (value) optionValues[title] = value
      }

      const { amountMajor, originalMajor, discount: variantDiscount } =
        computeUiPriceForVariant(p, variant)

      return {
        id: variant.id,
        title: variant.title,
        inventory_quantity: variant.inventory_quantity,
        manage_inventory: variant.manage_inventory,
        allow_backorder: variant.allow_backorder,
        weight: variant.weight ?? null,
        length: variant.length ?? null,
        height: variant.height ?? null,
        width: variant.width ?? null,
        metadata: variant.metadata || null,
        options: optionValues,
        price: amountMajor ?? 0,
        mrp: originalMajor ?? amountMajor ?? 0,
        discount: variantDiscount,
      }
    }) || []

  const defaultVariant =
    mappedVariants.find((variant) => {
      const source = p.variants?.find((entry) => entry.id === variant.id)
      return source ? isVariantPurchasable(source) : false
    }) ?? mappedVariants[0]

  const defaultPricing = defaultVariant
    ? {
        price: defaultVariant.price,
        mrp: defaultVariant.mrp,
        discount: defaultVariant.discount,
      }
    : { amountMajor, originalMajor, discount }

  const optionTitles = productOptions.map((opt) => opt.title)
  const primaryVisualOption =
    typeof metaRecord.primary_visual_option === "string" && metaRecord.primary_visual_option.trim()
      ? metaRecord.primary_visual_option.trim()
      : optionTitles.find((title) => /color|colour|pattern|finish|shade|style/i.test(title)) ||
        optionTitles[0]

  const visualOptionValues =
    productOptions.find((opt) => opt.title === primaryVisualOption)?.values || []
  const normalizedColorImages: Record<string, string[]> = {}
  for (const [key, urls] of Object.entries(colorImages)) {
    const canonical =
      visualOptionValues.find((v) => v.toLowerCase() === key.toLowerCase()) || key
    normalizedColorImages[canonical] = normalizedColorImages[canonical]
      ? Array.from(new Set([...normalizedColorImages[canonical], ...urls]))
      : urls
  }

  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    handle: p.handle,
    price: defaultPricing.price ?? amountMajor ?? 0,
    mrp: defaultPricing.mrp ?? originalMajor ?? amountMajor ?? 0,
    discount: defaultPricing.discount ?? discount,
    currency: DEFAULT_CURRENCY_CODE.toUpperCase(),
    images: collectProductImages(p),
    thumbnail: p.thumbnail || undefined,
    variant_id: defaultVariant?.id,
    colorImages: Object.keys(normalizedColorImages).length > 0 ? normalizedColorImages : undefined,
    primaryVisualOption,
    options: productOptions,
    variants: mappedVariants,
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


// A variant is purchasable when inventory is unmanaged, backorders are allowed, or there is stock.
export function isVariantPurchasable(v: {
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number
}): boolean {
  if (v.manage_inventory === false) return true
  if (v.allow_backorder === true) return true
  return typeof v.inventory_quantity === 'number' && v.inventory_quantity > 0
}

function computeUiPriceForVariant(
  p: MedusaProduct,
  variant?: NonNullable<MedusaProduct['variants']>[number]
) {
  // LOGIC:
  // User confirms the database stores MAJOR units (Rupees).
  // Medusa API returns these values directly.
  // We should NOT divide by 100. We just use the values as-is.

  const medusaCalculated = p.price?.calculated_price
  const medusaOriginal = p.price?.original_price

  const v = variant ?? p.variants?.[0]
  const variantCalculated = v?.calculated_price?.calculated_amount
  const variantOriginal = v?.calculated_price?.original_amount
  const rawDbPrice = v?.prices?.[0]?.amount
  const metaPriceList = (v?.metadata as Record<string, unknown> | undefined)?._price_list_prices
  const priceListEntry = Array.isArray(metaPriceList) ? metaPriceList[0] : undefined
  const priceListAmount =
    priceListEntry && typeof priceListEntry === "object" && priceListEntry !== null
      ? Number((priceListEntry as { amount?: unknown }).amount)
      : undefined
  const variantPriceAmounts = (v?.prices || [])
    .map((entry) => Number(entry?.amount))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
  const minVariantPrice =
    variantPriceAmounts.length > 0 ? Math.min(...variantPriceAmounts) : undefined
  const maxVariantPrice =
    variantPriceAmounts.length > 0 ? Math.max(...variantPriceAmounts) : undefined

  // Determine final Selling Price (Major) - DB is now in Rupees, use directly
  let amountMajor = 0

  if (variant) {
    if (typeof variantCalculated === "number") {
      amountMajor = variantCalculated
    } else if (typeof priceListAmount === "number" && priceListAmount > 0) {
      amountMajor = priceListAmount
    } else if (typeof minVariantPrice === "number") {
      amountMajor = minVariantPrice
    } else if (typeof rawDbPrice === "number") {
      amountMajor = rawDbPrice
    }
  } else if (typeof medusaCalculated === "number") {
      amountMajor = medusaCalculated
  } else if (typeof variantCalculated === "number") {
      amountMajor = variantCalculated
  } else if (typeof priceListAmount === "number" && priceListAmount > 0) {
      amountMajor = priceListAmount
  } else if (typeof minVariantPrice === "number") {
      amountMajor = minVariantPrice
  } else if (typeof rawDbPrice === "number") {
      amountMajor = rawDbPrice
  }

  // Determine final MRP (Major) - DB is now in Rupees, use directly
  let originalMajor = amountMajor // Default to selling price

  if (variant) {
    if (typeof variantOriginal === "number") {
      originalMajor = variantOriginal
    } else if (typeof maxVariantPrice === "number") {
      originalMajor = maxVariantPrice
    }
  } else if (typeof medusaOriginal === "number") {
      originalMajor = medusaOriginal
  } else if (typeof variantOriginal === "number") {
      originalMajor = variantOriginal
  } else if (typeof maxVariantPrice === "number") {
      originalMajor = maxVariantPrice
  }

  // Sanity fallback: if original < amount, reset original
  if (originalMajor < amountMajor) {
      originalMajor = amountMajor
  }

  // Calculate discount percentage
  const discount =
    (amountMajor > 0 && originalMajor > amountMajor)
      ? Math.round(((originalMajor - amountMajor) / originalMajor) * 100)
      : 0

  return { amountMajor, originalMajor, discount }
}

// Keep backward-compatible wrapper used by toDetailedProduct
function computeUiPrice(p: MedusaProduct) {
  return computeUiPriceForVariant(p, undefined)
}


export function isMedusaProductInStock(p: MedusaProduct): boolean {
  if (!p?.variants || p.variants.length === 0) return false
  return p.variants.some(isVariantPurchasable)
}

export function toUiProduct(p: MedusaProduct) {
  if (!p?.id || !p?.title) {
    console.warn("Incomplete product data:", p)
  }

  const image = collectProductImages(p)[0] || "/oweg_logo.png"
  const metadata = (p.metadata || {}) as Record<string, unknown>

  // Pick the best purchasable variant: prefer one that is explicitly purchasable;
  // fall back to the first variant so we always have a variant_id to show
  const purchasableVariant = p?.variants?.find(isVariantPurchasable) ?? p?.variants?.[0]

  // Compute price from the chosen variant so price and variant_id always match
  const { amountMajor, originalMajor, discount } = computeUiPriceForVariant(p, purchasableVariant)

  return {
    id: p?.id || "unknown",
    name: p?.title || "Unnamed Product",
    image,
    price: amountMajor ?? 0,
    mrp: originalMajor ?? amountMajor ?? 0,
    discount,
    limitedDeal: discount >= 20,
    opencartId: metadata["opencart_id"] as string | number | undefined,
    variant_id: purchasableVariant?.id,
    handle: p?.handle,
    category_ids: p?.categories?.map((c) => c.id).filter((id): id is string => !!id) || [],
    inventory_quantity: purchasableVariant?.inventory_quantity,
  }
}

export async function fetchProductDetail(
  idOrHandle: string,
  options?: { bypassCache?: boolean }
): Promise<DetailedProduct | null> {
  const target = idOrHandle?.trim()
  if (!target) return null

  const cacheKey = target.toLowerCase()
  if (!options?.bypassCache) {
    const cached = PRODUCT_DETAIL_CACHE.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return cached.value
    }
  }

  // Medusa v2: no expand or currency parameters, but we need fields
  const baseParams = new URLSearchParams()
  baseParams.set("fields", PRODUCT_LIST_FIELDS)
  const paramVariants: URLSearchParams[] = [baseParams]

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

        // Apply "Special Prices" price list if applicable (similar to listing route)
        const priceListPrices = await getPriceListPrices()
        for (const variant of product.variants || []) {
          const discountedPrice = priceListPrices.get(variant.id)
          if (discountedPrice === undefined) continue

          const originalPrice = variant.prices?.[0]?.amount || discountedPrice
          variant.calculated_price = {
            calculated_amount: discountedPrice,
            original_amount: originalPrice,
            currency_code: DEFAULT_CURRENCY_CODE,
          }
        }

        const firstVariantId = product.variants?.[0]?.id
        if (firstVariantId && priceListPrices.has(firstVariantId)) {
          const discountedPrice = priceListPrices.get(firstVariantId)!
          const originalPrice = product.variants?.[0]?.prices?.[0]?.amount || discountedPrice

          if (!product.price) product.price = {}
          product.price.calculated_price = discountedPrice
          product.price.original_price = originalPrice
        }

        // Admin price is only used if Medusa has no price data at all
        // Prices are taken from Medusa Admin, not OpenCart
        const detailed = toDetailedProduct(product)
        
        // If Medusa has no price and admin API returned a price, use it
        if (adminPrice !== undefined && detailed.price === 0) {
          detailed.price = adminPrice
          detailed.mrp = adminPrice
        }

        if (!options?.bypassCache) {
          PRODUCT_DETAIL_CACHE.set(cacheKey, {
            expires: Date.now() + DETAIL_CACHE_TTL_MS,
            value: detailed,
          })
        }
        return detailed
      }
    } catch {
      // try next path
    }
  }
  if (!options?.bypassCache) {
    PRODUCT_DETAIL_CACHE.set(cacheKey, {
      expires: Date.now() + DETAIL_CACHE_TTL_MS,
      value: null,
    })
  }
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

export type SitemapProductEntry = {
  handle: string;
  updatedAt?: Date;
};

export async function fetchProductSitemapEntries(
  revalidate = 3600,
): Promise<SitemapProductEntry[]> {
  const limit = 100;
  const entries: SitemapProductEntry[] = [];

  for (let offset = 0; offset < 20_000; offset += limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields: "handle,updated_at",
    });

    const res = await api(`/store/products?${params.toString()}`, { revalidate });
    if (!res.ok) break;

    const data = (await res.json()) as {
      products?: Array<{ handle?: string; updated_at?: string }>;
    };
    const page = data.products ?? [];
    if (!page.length) break;

    for (const product of page) {
      if (!product.handle) continue;
      entries.push({
        handle: product.handle,
        updatedAt: product.updated_at ? new Date(product.updated_at) : undefined,
      });
    }

    if (page.length < limit) break;
  }

  return entries;
}

export function collectCategorySitemapPaths(categories: MedusaCategory[]): string[] {
  const paths = new Set<string>();

  const walk = (nodes: MedusaCategory[], prefix: string[] = []) => {
    for (const node of nodes) {
      if (!node.handle) continue;

      const chain = [...prefix, node.handle];
      paths.add(`/c/${chain.join("/")}`);

      for (const child of node.category_children ?? []) {
        if (!child.handle) continue;
        paths.add(`/c/${node.handle}/${child.handle}`);
      }

      if (node.category_children?.length) {
        walk(node.category_children, chain);
      }
    }
  };

  walk(categories);
  return [...paths];
}

// fetchPriceOverrideForName function removed - using Medusa prices only
