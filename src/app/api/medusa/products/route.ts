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
    const debugRaw =
      process.env.NODE_ENV !== "production" &&
      searchParams.get("debug") === "1"
    if (!category && !categoryId && !tag && !type) return NextResponse.json({ products: [] })

    let products
    if (type) {
      products = await fetchProductsByType(type, limit)
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
      products = await fetchProductsByTag(tag, limit)
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
      products = await fetchProductsByCategoryId(catId, limit)
    }
    if (debugRaw) {
      return NextResponse.json({ products })
    }

    const priceOverrides = await buildPriceOverrides(products)

    const ui = products.map((product) => {
      const nameKey = normalizeProductName(product.title || product.subtitle)
      const override = priceOverrides.get(nameKey)
      return toUiProduct(product, override)
    })
    return NextResponse.json({ products: ui })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type PriceOverride = {
  price?: number
  mrp?: number
}

function normalizeProductName(name?: string | null) {
  return (name || "").trim().toLowerCase()
}

async function buildPriceOverrides(products: MedusaProduct[]) {
  const map = new Map<string, PriceOverride>()
  const uniqueNames = new Map<string, string>()

  for (const product of products) {
    const key = normalizeProductName(product.title || product.subtitle)
    if (key && !uniqueNames.has(key)) {
      uniqueNames.set(key, product.title || product.subtitle || "")
    }
  }

  await Promise.all(
    Array.from(uniqueNames.entries()).map(async ([normName, originalName]) => {
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

        if (Number.isFinite(basePrice) || Number.isFinite(specialPrice)) {
          map.set(normName, {
            price: Number.isFinite(specialPrice) ? specialPrice : basePrice,
            mrp: Number.isFinite(basePrice) ? basePrice : specialPrice,
          })
        }
      } catch (err) {
        console.warn("Failed to hydrate price for", originalName, err)
      }
    })
  )

  return map
}
