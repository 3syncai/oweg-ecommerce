import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { CategoryWithBanners } from "./mega-menu-banners"

export const CATEGORY_FIELDS = [
  "id",
  "name",
  "handle",
  "metadata",
  "parent_category_id",
  "created_at",
  "updated_at",
]

export async function retrieveCategoryById(req: MedusaRequest, id: string) {
  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "product_category",
    fields: CATEGORY_FIELDS,
    filters: { id },
  })
  return (data?.[0] || null) as CategoryWithBanners | null
}

export async function retrieveCategoryByHandle(req: MedusaRequest, handle: string) {
  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "product_category",
    fields: CATEGORY_FIELDS,
    filters: { handle },
  })
  if (data?.[0]) return data[0] as CategoryWithBanners

  const { data: allCategories } = await query.graph({
    entity: "product_category",
    fields: CATEGORY_FIELDS,
    pagination: { skip: 0, take: 500 },
  })

  const normalized = handle
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (
    ((allCategories || []) as CategoryWithBanners[]).find((category) => {
      const catHandle = (category.handle || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      return catHandle === normalized
    }) || null
  )
}

export async function updateCategoryMetadata(
  req: MedusaRequest,
  id: string,
  metadata: Record<string, unknown>
) {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  return productModuleService.updateProductCategories(id, { metadata })
}

export async function listAllCategories(req: MedusaRequest) {
  const query = req.scope.resolve("query")
  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: CATEGORY_FIELDS,
    pagination: { skip: 0, take: 500 },
  })
  return (categories || []) as CategoryWithBanners[]
}

export type SubcategoryRow = {
  id: string
  name: string
  handle: string
}

export async function listSubcategoriesByParentId(
  req: MedusaRequest,
  parentId: string
): Promise<SubcategoryRow[]> {
  const query = req.scope.resolve("query")

  try {
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id"],
      filters: { parent_category_id: parentId },
      pagination: { skip: 0, take: 200 },
    })

    const rows = ((data || []) as Array<{ id: string; name?: string | null; handle?: string | null }>)
      .map((row) => ({
        id: row.id,
        name: row.name || "",
        handle: row.handle || "",
      }))
      .filter((row) => row.handle)

    if (rows.length > 0) {
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    }
  } catch (error) {
    console.warn("listSubcategoriesByParentId filter query failed, falling back:", error)
  }

  const allCategories = await listAllCategories(req)
  return allCategories
    .filter((category) => category.parent_category_id === parentId)
    .map((category) => ({
      id: category.id,
      name: category.name || "",
      handle: category.handle || "",
    }))
    .filter((row) => row.handle)
    .sort((a, b) => a.name.localeCompare(b.name))
}
