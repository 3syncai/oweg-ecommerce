import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  fetchProductsByCategoryId,
  fetchProductsByTag,
  fetchProductsByType,
  MedusaProduct,
  toUiProduct,
} from "@/lib/medusa"
import { executeReadQuery } from "@/lib/mysql"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")
    const categoryId = searchParams.get("categoryId")
    const tag = searchParams.get("tag")
    const type = searchParams.get("type")
    const limit = Number(searchParams.get("limit") || 20)
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 20
    const priceMinParam = searchParams.get("priceMin")
    const priceMaxParam = searchParams.get("priceMax")
    const priceMin = priceMinParam !== null ? Number(priceMinParam) : undefined
    const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : undefined
    const dealsOnly = searchParams.get("dealsOnly") === "1"
    const debugRaw =
      process.env.NODE_ENV !== "production" &&
      searchParams.get("debug") === "1"
    if (!category && !categoryId && !tag && !type) return NextResponse.json({ products: [] })

    let products
    if (type) {
      products = await fetchProductsByType(type, normalizedLimit)
      // Fallback: if no products by type, try category with same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(type)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, limit)
          } catch {}
        }
      }
    } else if (tag) {
      products = await fetchProductsByTag(tag, normalizedLimit)
      // Fallback: if no products by tag, try matching a category with the same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(tag)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, limit)
          } catch {}
        }
      }
    } else {
      const catId = categoryId || (await (async () => {
        if (!category) return undefined
        const cat = await findCategoryByTitleOrHandle(category)
        return cat?.id
      })())
      if (!catId) return NextResponse.json({ products: [] })
      products = await fetchProductsByCategoryId(catId, normalizedLimit)
    }
    if (debugRaw) {
      return NextResponse.json({ products })
    }

    const priceOverrides = await buildPriceOverrides(products)
    const normalizedPriceMin =
      typeof priceMin === "number" && Number.isFinite(priceMin)
        ? priceMin
        : undefined
    const normalizedPriceMax =
      typeof priceMax === "number" && Number.isFinite(priceMax)
        ? priceMax
        : undefined

    let ui = products.map((product) => {
      const override = priceOverrides.get(product.id)
      return toUiProduct(product, override)
    })

    if (normalizedPriceMin !== undefined) {
      ui = ui.filter((product) => product.price >= normalizedPriceMin)
    }
    if (normalizedPriceMax !== undefined) {
      ui = ui.filter((product) => product.price <= normalizedPriceMax)
    }
    if (dealsOnly) {
      ui = ui.filter((product) => product.limitedDeal)
    }

    return NextResponse.json({ products: ui })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type PriceOverride = {
  price?: number
  mrp?: number
  isDeal?: boolean
  opencartId?: string
}

function normalizeProductName(name?: string | null) {
  return (name || "").trim().toLowerCase()
}

async function buildPriceOverrides(products: MedusaProduct[]) {
  const map = new Map<string, PriceOverride>()
  const productIdToOcId = new Map<string, string>()
  const ocIdToMedusaIds = new Map<string, string[]>()
  const fallbackProducts: MedusaProduct[] = []

  for (const product of products) {
    const metadata = (product.metadata || {}) as Record<string, unknown>
    const ocId = metadata["opencart_id"] as string | number | undefined
    if (ocId !== undefined && ocId !== null) {
      const ocIdStr = String(ocId)
      productIdToOcId.set(product.id, ocIdStr)
      const existing = ocIdToMedusaIds.get(ocIdStr) || []
      existing.push(product.id)
      ocIdToMedusaIds.set(ocIdStr, existing)
    } else {
      fallbackProducts.push(product)
    }
  }

  const distinctOcIds = Array.from(new Set(productIdToOcId.values()))

  if (distinctOcIds.length > 0) {
    const placeholders = distinctOcIds.map(() => "?").join(",")
    try {
      const rows = await executeReadQuery<
        Array<{ product_id: number; price: string | null; special_price: string | null }>
      >(
        `
          SELECT 
            p.product_id,
            p.price,
            (
              SELECT ps.price
              FROM oc_product_special ps
              WHERE ps.product_id = p.product_id
                AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
                AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
              ORDER BY ps.priority ASC, ps.price ASC
              LIMIT 1
            ) AS special_price
          FROM oc_product p
          WHERE p.product_id IN (${placeholders})
        `,
        distinctOcIds
      )

      for (const row of rows) {
        const medusaIds = ocIdToMedusaIds.get(String(row.product_id)) || []
        if (!medusaIds.length) continue
        const basePrice = parseFloat(row.price || "")
        const specialPrice = row.special_price ? parseFloat(row.special_price) : undefined
        const hasBase = Number.isFinite(basePrice)
        const hasSpecial = Number.isFinite(specialPrice)

        if (!hasBase && !hasSpecial) continue

        for (const medusaId of medusaIds) {
          map.set(medusaId, {
            price: hasSpecial ? (specialPrice as number) : (basePrice as number),
            mrp: hasBase ? (basePrice as number) : hasSpecial ? (specialPrice as number) : undefined,
            isDeal: hasSpecial,
            opencartId: String(row.product_id),
          })
        }
      }
    } catch (err) {
      console.warn("Failed to hydrate price overrides via OpenCart IDs", err)
    }
  }

  if (fallbackProducts.length === 0) {
    return map
  }

  const nameMap = new Map<
    string,
    { originalName: string; medusaIds: string[] }
  >()

  for (const product of fallbackProducts) {
    const key = normalizeProductName(product.title || product.subtitle)
    if (!key) continue
    const originalName = product.title || product.subtitle || product.handle || ""
    if (!originalName) continue
    const entry = nameMap.get(key)
    if (entry) {
      entry.medusaIds.push(product.id)
    } else {
      nameMap.set(key, { originalName, medusaIds: [product.id] })
    }
  }

  await Promise.all(
    Array.from(nameMap.values()).map(async ({ originalName, medusaIds }) => {
      try {
        const rows = await executeReadQuery<
          Array<{ price: string | null; special_price: string | null }>
        >(
          `
            SELECT 
              p.price,
              (
                SELECT ps.price
                FROM oc_product_special ps
                WHERE ps.product_id = p.product_id
                  AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
                  AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
                ORDER BY ps.priority ASC, ps.price ASC
                LIMIT 1
              ) AS special_price
            FROM oc_product p
            INNER JOIN oc_product_description pd 
              ON p.product_id = pd.product_id AND pd.language_id = 1
            WHERE pd.name = ?
            LIMIT 1
          `,
          [originalName]
        )

        const row = rows[0]
        if (!row) return
        const basePrice = parseFloat(row.price || "")
        const specialPrice = row.special_price ? parseFloat(row.special_price) : undefined
        const hasBase = Number.isFinite(basePrice)
        const hasSpecial = Number.isFinite(specialPrice)
        if (!hasBase && !hasSpecial) return

        for (const medusaId of medusaIds) {
          map.set(medusaId, {
            price: hasSpecial ? (specialPrice as number) : (basePrice as number),
            mrp: hasBase ? (basePrice as number) : hasSpecial ? (specialPrice as number) : undefined,
            isDeal: hasSpecial,
          })
        }
      } catch (err) {
        console.warn("Failed to hydrate price for", originalName, err)
      }
    })
  )

  return map
}
