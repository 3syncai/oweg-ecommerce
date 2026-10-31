import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { refetchEntities } from "@medusajs/framework/http"

/** Keep the standard category list in the same sibling order as Organize. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { data: product_categories, metadata } = await refetchEntities({
    entity: "product_category",
    idOrFilter: req.filterableFields,
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: {
      ...req.queryConfig.pagination,
      order: req.queryConfig.pagination.order ?? { rank: "ASC", id: "ASC" },
    },
  })
  res.json({ product_categories, count: metadata.count, offset: metadata.skip, limit: metadata.take })
}
