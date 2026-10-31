import { getMeiliClient, waitForMeiliTask } from "./meilisearch"

export const PRODUCTS_INDEX = "products"

type AnyRecord = Record<string, any>

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeHandle(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function pickBrand(product: AnyRecord): string {
  const metadata = (product.metadata ?? {}) as AnyRecord
  const fromMeta =
    metadata.brand ||
    metadata.brand_name ||
    metadata.manufacturer ||
    metadata.vendor

  const candidate = normalizeText(fromMeta)
  if (candidate) return candidate

  const title = normalizeText(product.title)
  const first = title.split(" ")[0] || "Other"
  return first.replace(/[^a-z0-9]/gi, "") || "Other"
}

function pickPrimaryPrice(prices: AnyRecord[] = []): number {
  if (!Array.isArray(prices) || prices.length === 0) return 0

  const inrAmounts = prices
    .filter((p) => String(p?.currency_code || "").toLowerCase() === "inr")
    .map((p) => toNumber(p?.amount))
    .filter((v): v is number => typeof v === "number")

  if (inrAmounts.length > 0) {
    return Math.min(...inrAmounts)
  }

  const allAmounts = prices
    .map((p) => toNumber(p?.amount))
    .filter((v): v is number => typeof v === "number")

  if (allAmounts.length > 0) {
    return Math.min(...allAmounts)
  }

  return 0
}

function pickMrp(product: AnyRecord, variant: AnyRecord, fallbackPrice: number): number {
  const pMeta = (product.metadata ?? {}) as AnyRecord
  const vMeta = (variant.metadata ?? {}) as AnyRecord

  const candidates = [
    toNumber(pMeta.mrp),
    toNumber(pMeta.original_price),
    toNumber(pMeta.compare_at_price),
    toNumber(vMeta.mrp),
    toNumber(vMeta.original_price),
    toNumber(vMeta.compare_at_price),
  ].filter((n): n is number => typeof n === "number")

  if (candidates.length > 0) {
    const candidate = Math.max(...candidates.filter((n) => n >= fallbackPrice))
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate
    }
  }

  const variantPrices = Array.isArray(variant?.prices) ? variant.prices : []
  const priceCandidates = variantPrices
    .map((p: AnyRecord) => toNumber(p?.amount))
    .filter((n: number | undefined): n is number => typeof n === "number" && n >= fallbackPrice)

  if (priceCandidates.length > 0) {
    return Math.max(...priceCandidates)
  }

  return fallbackPrice
}

function computeStockScore(variants: AnyRecord[] = []): { inStock: boolean; stockScore: number } {
  if (!Array.isArray(variants) || variants.length === 0) return { inStock: false, stockScore: 0 }

  let inStock = false
  for (const variant of variants) {
    const manageInventory = Boolean(variant?.manage_inventory)
    const allowBackorder = Boolean(variant?.allow_backorder)
    const qty = toNumber(variant?.inventory_quantity) ?? 0
    if (!manageInventory || allowBackorder || qty > 0) {
      inStock = true
      break
    }
  }

  return { inStock, stockScore: inStock ? 1 : 0 }
}

function getCategoryTitles(product: AnyRecord): string[] {
  const categories = Array.isArray(product.categories) ? product.categories : []
  return categories
    .map((c) => normalizeText(c?.name || c?.title))
    .filter(Boolean)
}

function getCategoryIds(product: AnyRecord): string[] {
  const categories = Array.isArray(product.categories) ? product.categories : []
  return categories
    .map((c) => normalizeText(c?.id))
    .filter(Boolean)
}

function getTags(product: AnyRecord): string[] {
  const tags = Array.isArray(product.tags) ? product.tags : []
  return tags
    .map((t) => normalizeText(t?.value || t?.handle))
    .filter(Boolean)
}

/** Retail synonyms for typo-tolerant Amazon-like recall. */
export const PRODUCT_SEARCH_SYNONYMS: Record<string, string[]> = {
  tv: ["television"],
  television: ["tv"],
  bulb: ["lamp", "light", "led", "led lamp"],
  lamp: ["bulb", "light", "led"],
  fridge: ["refrigerator", "fridge freezer"],
  refrigerator: ["fridge"],
  ac: ["air conditioner", "airconditioner", "aircon"],
  "air conditioner": ["ac", "airconditioner", "aircon"],
  mixer: ["grinder", "mixer grinder", "juicer"],
  fan: ["ceiling fan", "table fan", "pedestal fan"],
  mobile: ["phone", "smartphone", "cellphone", "cell phone"],
  phone: ["mobile", "smartphone"],
  laptop: ["notebook", "notebook pc"],
  geyser: ["water heater", "waterheater", "immersion rod"],
  cooker: ["pressure cooker", "rice cooker", "electric cooker"],
  oven: ["microwave", "microwave oven", "otg"],
  microwave: ["oven", "microwave oven"],
  iron: ["steam iron", "dry iron"],
  keyboard: ["keys"],
  mouse: ["computer mouse"],
  webcam: ["web camera", "e camera", "e-camera"],
  "power bank": ["powerbank", "battery pack"],
  powerbank: ["power bank", "battery pack"],
  speaker: ["bluetooth speaker", "soundbar"],
  camera: ["cctv", "security camera"],
  lock: ["em lock", "electromagnetic lock"],
  biometric: ["fingerprint", "fingerprint device"],
  castor: ["castor wheels", "caster", "caster wheels"],
  tawa: ["tava", "dosa tawa"],
  kadai: ["kadhai", "wok"],
  "frying pan": ["fry pan", "frypan"],
  induction: ["induction cooktop", "cooktop"],
  "gas stove": ["hob", "gas hob"],
}

export function buildSearchDocument(product: AnyRecord): AnyRecord {
  const variants = Array.isArray(product.variants) ? product.variants : []
  const variant = variants[0] ?? {}
  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const price = pickPrimaryPrice(prices)
  const mrp = pickMrp(product, variant, price)
  const discount =
    mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0

  const categoryTitles = getCategoryTitles(product)
  const categoryIds = getCategoryIds(product)
  const tags = getTags(product)
  const brand = pickBrand(product)
  const { inStock, stockScore } = computeStockScore(variants)

  const title = normalizeText(product.title)
  const subtitle = normalizeText(product.subtitle)
  const description = normalizeText(product.description)

  return {
    id: normalizeText(product.id),
    handle: normalizeHandle(product.handle || product.id),
    title,
    subtitle,
    description,
    thumbnail: normalizeText(product.thumbnail) || null,
    brand,
    category: normalizeText(product.collection_id) || "general",
    category_ids: categoryIds,
    category_titles: categoryTitles,
    collection_id: normalizeText(product.collection_id) || null,
    collection_title: normalizeText(product.collection?.title) || null,
    tags,
    price,
    mrp,
    discount,
    in_stock: inStock,
    stock_score: stockScore,
    rating: toNumber(product.metadata?.rating) ?? 0,
    sales_30d: toNumber(product.metadata?.sales_30d) ?? 0,
    popularity_score: toNumber(product.metadata?.popularity_score) ?? 0,
    status: normalizeText(product.status).toLowerCase() || "draft",
    created_at: product.created_at || null,
    updated_at: product.updated_at || null,
  }
}

export function getProductsIndexUid(): string {
  return process.env.MEILI_PRODUCTS_INDEX || PRODUCTS_INDEX
}

export async function ensureProductsIndex(): Promise<void> {
  const client = getMeiliClient()
  const uid = getProductsIndexUid()

  try {
    await client.getIndex(uid)
  } catch {
    const task = await client.createIndex(uid, { primaryKey: "id" })
    await waitForMeiliTask(client, task.taskUid)
  }

  const index = client.index(uid)
  const settingsTask = await index.updateSettings({
    searchableAttributes: [
      "title",
      "brand",
      "category_titles",
      "tags",
      "subtitle",
      "collection_title",
      "description",
      "handle",
    ],
    filterableAttributes: [
      "status",
      "in_stock",
      "category_ids",
      "category_titles",
      "collection_id",
      "price",
      "brand",
      "tags",
    ],
    sortableAttributes: [
      "in_stock",
      "price",
      "rating",
      "popularity_score",
      "sales_30d",
      "created_at",
    ],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
      "in_stock:desc",
      "popularity_score:desc",
      "rating:desc",
    ],
    synonyms: PRODUCT_SEARCH_SYNONYMS,
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 3,
        twoTypos: 6,
      },
    },
    pagination: {
      maxTotalHits: 10_000,
    },
  })
  await waitForMeiliTask(client, settingsTask.taskUid)
}

export async function upsertSearchDocument(doc: AnyRecord): Promise<void> {
  await ensureProductsIndex()
  const client = getMeiliClient()
  const index = client.index(getProductsIndexUid())
  const task = await index.addDocuments([doc], { primaryKey: "id" })
  await waitForMeiliTask(client, task.taskUid)
}

export async function deleteSearchDocument(productId: string): Promise<void> {
  const id = String(productId || "").trim()
  if (!id) return

  try {
    const client = getMeiliClient()
    const index = client.index(getProductsIndexUid())
    const task = await index.deleteDocument(id)
    await waitForMeiliTask(client, task.taskUid)
  } catch (error: any) {
    const code = error?.code || error?.errorCode || error?.httpStatus
    const msg = String(error?.message || "")
    if (code === 404 || code === "document_not_found" || msg.includes("not found")) {
      return
    }
    throw error
  }
}

export async function upsertProductToSearch(product: AnyRecord): Promise<void> {
  const doc = buildSearchDocument(product)
  if (String(doc.status).toLowerCase() !== "published") {
    await deleteSearchDocument(doc.id)
    return
  }
  await upsertSearchDocument(doc)
}
