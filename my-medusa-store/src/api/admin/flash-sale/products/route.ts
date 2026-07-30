import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

type CategoryRow = {
  id: string
  parent_category_id?: string | null
}

/**
 * Selected category + all descendants (products often hang off leaf categories
 * while admins filter by a parent like "Hardware").
 * Prefers SQL mpath when a DB client is available; falls back to module list.
 */
async function expandCategoryIds(
  productModuleService: any,
  rootCategoryId: string,
  dbClient?: Client | null
): Promise<string[]> {
  if (dbClient) {
    try {
      const result = await dbClient.query(
        `WITH root AS (
           SELECT id, mpath
           FROM product_category
           WHERE id = $1 AND deleted_at IS NULL
         )
         SELECT c.id
         FROM product_category c
         CROSS JOIN root r
         WHERE c.deleted_at IS NULL
           AND (
             c.id = r.id
             OR c.mpath LIKE r.mpath || r.id || '.%'
             OR c.parent_category_id = r.id
           )`,
        [rootCategoryId]
      )
      const ids = result.rows.map((r: { id: string }) => r.id).filter(Boolean)
      if (ids.length) {
        return Array.from(new Set(ids))
      }
    } catch (err: any) {
      console.warn(
        "[Flash Sale Products] SQL category expand failed:",
        err?.message
      )
    }
  }

  let allCategories: CategoryRow[] = []

  try {
    if (typeof productModuleService.listProductCategories === "function") {
      allCategories =
        (await productModuleService.listProductCategories(
          {},
          { take: 10_000 }
        )) || []
    }
  } catch (err: any) {
    console.warn(
      "[Flash Sale Products] listProductCategories failed:",
      err?.message
    )
  }

  if (!allCategories.length) {
    return [rootCategoryId]
  }

  const childrenByParent = new Map<string, string[]>()
  for (const cat of allCategories) {
    const parentId = cat.parent_category_id
    if (!parentId) continue
    const list = childrenByParent.get(parentId) || []
    list.push(cat.id)
    childrenByParent.set(parentId, list)
  }

  const ids = new Set<string>([rootCategoryId])
  const queue = [rootCategoryId]
  while (queue.length) {
    const current = queue.shift()!
    for (const childId of childrenByParent.get(current) || []) {
      if (ids.has(childId)) continue
      ids.add(childId)
      queue.push(childId)
    }
  }

  return Array.from(ids)
}

/**
 * Resolve product IDs linked to any of the given category IDs via the
 * product↔category join table (avoids listProducts without relations).
 * Returns null if the join table could not be queried.
 */
async function productIdsForCategories(
  dbClient: Client,
  categoryIds: string[]
): Promise<Set<string> | null> {
  if (!categoryIds.length) return new Set()

  const tableCandidates = [
    "product_category_product",
    "product_product_category",
  ]
  const columnCombos = [
    { product: "product_id", category: "product_category_id" },
    { product: "product_id", category: "category_id" },
  ]

  const placeholders = categoryIds.map((_, i) => `$${i + 1}`).join(",")

  for (const table of tableCandidates) {
    for (const cols of columnCombos) {
      try {
        const result = await dbClient.query(
          `SELECT DISTINCT ${cols.product} AS product_id
           FROM ${table}
           WHERE ${cols.category} IN (${placeholders})`,
          categoryIds
        )
        const productIds = new Set<string>()
        for (const row of result.rows) {
          if (row.product_id) productIds.add(row.product_id)
        }
        return productIds
      } catch {
        // wrong table/columns — try next
      }
    }
  }

  return null
}

// Get products with filters for flash sale selection
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  let dbClient: Client | null = null

  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const queryParams = req.query

    const { category, collection, type, search, limit = "100" } = queryParams
    const limitNum = parseInt(limit as string) || 100
    const categoryId =
      typeof category === "string" && category.trim() ? category.trim() : ""

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }

    dbClient = new Client({ connectionString: databaseUrl })
    await dbClient.connect()

    // When filtering by category, resolve parent + descendants and restrict
    // to products linked in the join table before other filters.
    let categoryProductIds: Set<string> | null = null
    let categoryIdsForFallback: string[] = []
    if (categoryId) {
      categoryIdsForFallback = await expandCategoryIds(
        productModuleService,
        categoryId,
        dbClient
      )
      categoryProductIds = await productIdsForCategories(
        dbClient,
        categoryIdsForFallback
      )
      console.log(
        `[Flash Sale Products] Category ${categoryId} → ${categoryIdsForFallback.length} category ids, linked products: ${
          categoryProductIds ? categoryProductIds.size : "sql-miss"
        }`
      )
    }

    // Fetch published products (search when provided).
    // If category SQL join failed, load categories relation for in-memory match.
    const needCategoryRelation =
      !!categoryId && categoryProductIds === null

    let allProducts: any[] = []
    const listConfig = needCategoryRelation
      ? { relations: ["categories"] }
      : undefined

    if (search) {
      allProducts = await productModuleService.listProducts(
        {
          q: search as string,
          status: ["published"],
        },
        listConfig
      )
    } else {
      allProducts = await productModuleService.listProducts(
        {
          status: ["published"],
        },
        listConfig
      )
    }

    let filteredProducts = allProducts

    if (categoryId) {
      if (categoryProductIds) {
        filteredProducts = filteredProducts.filter((product: any) =>
          categoryProductIds!.has(product.id)
        )
      } else {
        const idSet = new Set(categoryIdsForFallback)
        filteredProducts = filteredProducts.filter((product: any) =>
          product.categories?.some((cat: any) => idSet.has(cat.id))
        )
      }
    }

    if (collection) {
      filteredProducts = filteredProducts.filter((product: any) => {
        return (
          product.collection_id === collection ||
          product.collections?.some((col: any) => col.id === collection) ||
          false
        )
      })
    }

    if (type) {
      filteredProducts = filteredProducts.filter((product: any) => {
        return (
          product.type_id === type || product.type?.id === type || false
        )
      })
    }

    const totalCount = filteredProducts.length
    filteredProducts = filteredProducts.slice(0, limitNum)

    const productIds = filteredProducts.map((p: any) => p.id).filter(Boolean)

    if (productIds.length === 0) {
      return res.json({ products: [], count: 0, limit: limitNum })
    }

    const pricesMap = new Map<string, number>()

    try {
      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",")

      const priceQuery = `
        SELECT DISTINCT ON (pv.product_id)
          pv.product_id,
          p.amount,
          p.currency_code,
          p.price_set_id
        FROM product_variant pv
        INNER JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        INNER JOIN price_set ps ON ps.id = pvps.price_set_id
        INNER JOIN price p ON p.price_set_id = ps.id
        WHERE pv.product_id IN (${placeholders})
          AND p.amount IS NOT NULL
          AND p.amount > 0
          AND p.deleted_at IS NULL
        ORDER BY pv.product_id,
                 CASE WHEN p.currency_code = 'inr' THEN 0 ELSE 1 END,
                 p.amount ASC
      `

      const result = await dbClient.query(priceQuery, productIds)

      result.rows.forEach((row: any) => {
        if (row.product_id && row.amount) {
          const amount =
            typeof row.amount === "string"
              ? parseFloat(row.amount)
              : Number(row.amount)

          if (isNaN(amount) || amount <= 0) {
            return
          }

          const existingPrice = pricesMap.get(row.product_id)
          const isInr = row.currency_code?.toLowerCase() === "inr"

          if (!existingPrice) {
            pricesMap.set(row.product_id, amount)
          } else if (isInr) {
            pricesMap.set(row.product_id, amount)
          }
        }
      })
    } catch (dbError: any) {
      console.error(
        "[Flash Sale Products] Price query error:",
        dbError.message
      )
    }

    const formattedProducts = filteredProducts.map((product: any) => {
      let price = 0
      if (pricesMap.has(product.id)) {
        const priceAmount = pricesMap.get(product.id) || 0
        price =
          typeof priceAmount === "string"
            ? parseFloat(priceAmount)
            : priceAmount
      }

      const variantId =
        product.variants && product.variants.length > 0
          ? product.variants[0].id
          : null

      return {
        id: product.id,
        title: product.title,
        thumbnail: product.thumbnail,
        images: product.images,
        price: price,
        variant_id: variantId,
      }
    })

    return res.json({
      products: formattedProducts,
      count: totalCount,
      limit: limitNum,
    })
  } catch (error: any) {
    console.error("Error fetching products:", error)
    return res.status(500).json({
      message: "Failed to fetch products",
      error: error.message,
    })
  } finally {
    if (dbClient) {
      try {
        await dbClient.end()
      } catch {
        // ignore close errors
      }
    }
  }
}
