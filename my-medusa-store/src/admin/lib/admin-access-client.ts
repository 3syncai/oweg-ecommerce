import type { AdminAccess } from "../../shared/admin-access"

export async function accessRequest<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/admin/access${path}`, {
    credentials: "include",
    cache: "no-store",
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || "Unable to complete this request")
  return data
}

export async function currentAdminAccess(): Promise<AdminAccess> {
  return (await accessRequest<{ access: AdminAccess }>("/me")).access
}
