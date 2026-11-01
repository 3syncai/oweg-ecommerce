import type { Pool } from "pg"
import type { PaginationParams } from "./vendor-pagination"

/** Select IDs before expanding images/variants. Counts and IDs share one DB snapshot. */
export async function vendorProductSelection(
  db: Pick<Pool, "query">,
  vendorId: string,
  pagination: PaginationParams,
  search: string,
  status: string
) {
  const { rows } = await db.query(`
    WITH catalog AS (
      SELECT id, COALESCE(updated_at, created_at) AS modified_at,
        lower(COALESCE(title, '') || ' ' || COALESCE(handle, '') || ' ' ||
          COALESCE(subtitle, '') || ' ' || id) AS search_text,
        CASE WHEN lower(COALESCE(metadata->>'approval_status', '')) = 'pending'
          THEN 'pending' WHEN lower(status::text) = 'published'
          THEN 'published' ELSE 'draft' END AS list_status
      FROM product WHERE deleted_at IS NULL AND metadata->>'vendor_id' = $1
    ), filtered AS (
      SELECT id, modified_at FROM catalog
      WHERE ($2 = '' OR strpos(search_text, $2) > 0)
        AND ($3 IN ('', 'all') OR list_status = $3)
    ), page AS (
      SELECT id, modified_at FROM filtered
      ORDER BY modified_at DESC NULLS LAST, id DESC LIMIT $4 OFFSET $5
    )
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE list_status = 'published')::int AS published,
      count(*) FILTER (WHERE list_status = 'pending')::int AS pending,
      count(*) FILTER (WHERE list_status = 'draft')::int AS draft,
      (SELECT count(*)::int FROM filtered) AS count,
      COALESCE((SELECT json_agg(id ORDER BY modified_at DESC NULLS LAST, id DESC)
        FROM page), '[]'::json) AS ids
    FROM catalog
  `, [vendorId, search, status, pagination.all ? null : pagination.limit,
    pagination.all ? 0 : pagination.offset])
  const row = rows[0]
  return {
    ids: row.ids as string[],
    count: Number(row.count),
    counts: { total: Number(row.total), published: Number(row.published),
      pending: Number(row.pending), draft: Number(row.draft) },
  }
}
