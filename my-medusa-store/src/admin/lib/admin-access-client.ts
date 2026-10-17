import type { AdminAccess } from "../../shared/admin-access"

export async function accessRequest<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/admin/access${path}`, {
    credentials: "include",
    cache: "no-store",
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (!response.ok) {
    if (path.startsWith("/roles") && /^Invalid fields:.*permissions\.\d/.test(data.message || ""))
      throw new Error("The Medusa backend rejected the selected responsibilities. Update and restart the Medusa backend from the same revision as the admin app, then refresh. Your selection has been kept.")
    throw new Error(data.message || "Unable to complete this request")
  }
  return data
}

export async function currentAdminAccess(): Promise<AdminAccess> {
  return (await accessRequest<{ access: AdminAccess }>("/me")).access
}
