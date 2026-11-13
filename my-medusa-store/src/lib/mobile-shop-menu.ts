import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { defaultMobileMenu, parseMobileMenu, type MobileMenuItem } from "../shared/mobile-shop-menu"

type Connection = {
  raw<T>(sql: string, bindings?: unknown[]): Promise<{ rows: T[] }>
}

function connection(req: MedusaRequest) {
  return req.scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION)
}

export async function readMobileMenu(req: MedusaRequest) {
  const { rows } = await connection(req).raw<{ menu: unknown }>(
    "SELECT metadata->'oweg_mobile_shop_menu' AS menu FROM store WHERE deleted_at IS NULL ORDER BY id LIMIT 1"
  )
  return parseMobileMenu(rows[0]?.menu) ?? defaultMobileMenu
}

export async function publishMobileMenu(req: MedusaRequest, items: MobileMenuItem[]) {
  const { rows } = await connection(req).raw<{ id: string }>(
    `UPDATE store
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{oweg_mobile_shop_menu}', ?::jsonb),
           updated_at = now()
       WHERE id = (SELECT id FROM store WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
         AND deleted_at IS NULL
       RETURNING id`, [JSON.stringify(items)]
  )
  return rows.length === 1
}
