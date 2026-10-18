import type { AdminAccess } from "./admin-access"

export const ADMIN_PASSWORD_MIN_LENGTH = 12
export const ADMIN_PASSWORD_MAX_LENGTH = 128
export const ADMIN_DELETE_CONFIRMATION = "CONFIRM"

export function adminPasswordRequirements(password: string) {
  return [
    { label: "At least 12 characters", met: password.length >= ADMIN_PASSWORD_MIN_LENGTH },
    { label: "No more than 128 characters", met: password.length <= ADMIN_PASSWORD_MAX_LENGTH },
  ]
}

export function canDeleteAdminAccount(actor: Pick<AdminAccess, "user_id" | "kind" | "active">, target: Pick<AdminAccess, "user_id" | "kind">): boolean {
  return actor.active && actor.kind === "superadmin" && actor.user_id !== target.user_id && target.kind !== "superadmin"
}
