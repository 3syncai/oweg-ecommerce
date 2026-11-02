import type { Pool } from "pg"

// One row-level UPDATE: PostgreSQL re-evaluates this expression after a competing
// writer releases the customer row. Never replace unrelated metadata keys.
export const UPDATE_WISHLIST_SQL = `
UPDATE customer SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{wishlist}', (
  SELECT COALESCE(jsonb_agg(item ORDER BY first_position), '[]'::jsonb)
  FROM (
    SELECT item, min(position) AS first_position
    FROM jsonb_array_elements_text(
      (CASE WHEN jsonb_typeof(metadata->'wishlist') = 'array'
        THEN metadata->'wishlist' ELSE '[]'::jsonb END)
      || CASE WHEN $3::boolean THEN jsonb_build_array($2::text) ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entries(item, position)
    WHERE item <> '' AND ($3::boolean OR item <> $2::text)
    GROUP BY item
  ) unique_items
)), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING metadata->'wishlist' AS wishlist`

export async function setWishlistItem(pool: Pool, customerId: string, productId: string, saved: boolean) {
  const result = await pool.query<{ wishlist: string[] }>(UPDATE_WISHLIST_SQL, [customerId, productId, saved])
  return result.rows[0]?.wishlist
}
