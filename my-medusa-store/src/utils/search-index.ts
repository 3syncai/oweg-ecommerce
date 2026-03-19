import client from "./opensearch"

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

  // Fallback from variant prices: use highest available price as MRP.
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

export function createProductsIndexBody() {
  return {
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      analysis: {
        filter: {
          oweg_synonyms: {
            type: "synonym_graph",
            synonyms: [
              "tv, television",
              "bulb, lamp, light",
              "fridge, refrigerator",
              "ac, air conditioner",
              "mixer, grinder, mixer grinder",
            ],
          },
          oweg_edge_ngram: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 20,
          },
        },
        analyzer: {
          oweg_text: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding", "oweg_synonyms"],
          },
          oweg_prefix: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding", "oweg_edge_ngram"],
          },
        },
      },
    },
    mappings: {
      dynamic: false,
      properties: {
        id: { type: "keyword" },
        handle: { type: "keyword" },
        title: {
          type: "text",
          analyzer: "oweg_text",
          fields: {
            keyword: { type: "keyword", ignore_above: 512 },
            prefix: {
              type: "text",
              analyzer: "oweg_prefix",
              search_analyzer: "oweg_text",
            },
          },
        },
        subtitle: { type: "text", analyzer: "oweg_text" },
        description: { type: "text", analyzer: "oweg_text" },
        thumbnail: { type: "keyword", index: false },
        brand: {
          type: "text",
          analyzer: "oweg_text",
          fields: { keyword: { type: "keyword", ignore_above: 256 } },
        },
        category: { type: "keyword" },
        category_ids: { type: "keyword" },
        category_titles: { type: "text", analyzer: "oweg_text" },
        collection_id: { type: "keyword" },
        collection_title: { type: "text", analyzer: "oweg_text" },
        tags: { type: "keyword" },
        price: { type: "float" },
        mrp: { type: "float" },
        discount: { type: "integer" },
        in_stock: { type: "boolean" },
        stock_score: { type: "integer" },
        rating: { type: "float" },
        sales_30d: { type: "integer" },
        popularity_score: { type: "float" },
        status: { type: "keyword" },
        created_at: { type: "date", format: "strict_date_optional_time||epoch_millis" },
        updated_at: { type: "date", format: "strict_date_optional_time||epoch_millis" },
      },
    },
  }
}

export async function ensureProductsIndex() {
  const exists = await client.indices.exists({ index: PRODUCTS_INDEX })
  if (exists.body) return
  await client.indices.create({
    index: PRODUCTS_INDEX,
    body: createProductsIndexBody() as any,
  })
}
