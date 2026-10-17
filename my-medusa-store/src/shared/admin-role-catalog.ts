import { ADMIN_PERMISSION_GROUPS } from "./admin-access"
import { ADMIN_RESPONSIBILITIES } from "./admin-responsibilities"

export type AdminRoleCatalog = { version: 2; supported_permission_ids: string[] }

export function adminRoleCatalog(customIds: string[] = []): AdminRoleCatalog {
  return { version: 2, supported_permission_ids: [
    ...ADMIN_PERMISSION_GROUPS.map(group => group.id),
    ...ADMIN_RESPONSIBILITIES.map(item => item.id), ...customIds,
  ] }
}

/** Older backends accept section grants, but must never receive unsupported fine-grained IDs. */
export function supportedRolePermissions(catalog: AdminRoleCatalog | undefined, customIds: string[] = []): string[] {
  return catalog?.version === 2 && Array.isArray(catalog.supported_permission_ids)
    ? catalog.supported_permission_ids
    : [...ADMIN_PERMISSION_GROUPS.map(group => group.id), ...customIds]
}

export function roleCompatibilityError(permissions: readonly string[], supported: readonly string[]): string | null {
  return permissions.some(permission => !supported.includes(permission))
    ? "The Medusa backend does not support one or more selected responsibilities. Deploy and restart the backend from the same revision as this admin app, then refresh. Your selection has been kept."
    : null
}
