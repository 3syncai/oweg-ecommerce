import { ADMIN_RESPONSIBILITIES } from "../../shared/admin-responsibilities"
import { ADMIN_DELETE_CONFIRMATION, ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH } from "../../shared/admin-account-controls"
import { z } from "zod"
import { MedusaError } from "@medusajs/framework/utils"
import { ADMIN_PERMISSION_GROUPS, validCustomPermissionPath } from "../../shared/admin-access"

const permission = z.string().refine(value => ADMIN_PERMISSION_GROUPS.some(group => group.id === value) || ADMIN_RESPONSIBILITIES.some(item => item.id === value) || /^custom_[0-9a-f-]{36}$/.test(value), "Choose a registered permission")
export const roleInput = z.object({
  name: z.string().trim().min(1).max(100),
  responsibilities: z.string().trim().max(2000).default(""),
  permissions: z.array(permission).max(100),
}).strict()
export const customPermissionInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).default(""),
  page_paths: z.array(z.string().trim().refine(path => validCustomPermissionPath(path, "page"), "Use a non-reserved admin page path")).min(1).max(10),
  api_paths: z.array(z.string().trim().refine(path => validCustomPermissionPath(path, "api"), "Use a non-reserved /admin/ API path")).min(1).max(10),
  access_mode: z.enum(["view", "manage"]),
  enabled: z.boolean().default(true),
}).strict()
export const accountInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  first_name: z.string().trim().max(100).default(""),
  last_name: z.string().trim().max(100).default(""),
  password: z.string().min(ADMIN_PASSWORD_MIN_LENGTH).max(ADMIN_PASSWORD_MAX_LENGTH).optional(),
  role_id: z.string().min(1).max(100),
}).strict()
export const assignmentInput = z.object({ role_id: z.string().min(1).max(100), active: z.boolean() }).strict()
export const deleteAccountInput = z.object({ confirmation: z.literal(ADMIN_DELETE_CONFIRMATION) }).strict()
export const credentialInput = z.object({ password: z.string().min(12).max(128).optional() }).strict()

export function parseAccessInput<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    if (result.error.issues.every(issue => issue.path[0] === "permissions"))
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose only responsibilities offered by this Medusa backend. If the admin app was recently deployed, deploy and restart the matching Medusa backend revision, then refresh.")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid fields: ${[...new Set(result.error.issues.map(i => i.path.join(".") || "request"))].join(", ")}`)
  }
  return result.data
}

export const changePasswordInput = z.object({ current_password: z.string().min(1).max(128), new_password: z.string().min(12).max(128) }).strict()
