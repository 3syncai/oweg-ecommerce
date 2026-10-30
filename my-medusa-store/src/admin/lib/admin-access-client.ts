import type { AdminAccess } from "../../shared/admin-access"

let pendingAccess: Promise<AdminAccess> | undefined

/** Share concurrent reads only; never keep completed authorization data. */
export function resetAdminAccessRequest() {
  pendingAccess = undefined
}

export async function accessRequest<T = any>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  const response = await fetch(`/admin/access${path}`, {
    credentials: "include",
    cache: "no-store",
    // Abort read-only checks, never a mutation that might already have committed.
    ...(body === undefined ? { signal: AbortSignal.timeout(12_000) } : {}),
    ...(body === undefined ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (!response.ok) {
    if (path.startsWith("/roles") && /^Invalid fields:.*permissions\.\d/.test(data.message || ""))
      throw new Error("The Medusa backend rejected the selected responsibilities. Update and restart the Medusa backend from the same revision as the admin app, then refresh. Your selection has been kept.")
    throw new Error(data.message || "Unable to complete this request")
  }
  return data
}

export function currentAdminAccess(): Promise<AdminAccess> {
  if (!pendingAccess) {
    const request = accessRequest<{ access: AdminAccess }>("/me").then(result => result.access)
    pendingAccess = request
    void request.finally(() => {
      if (pendingAccess === request) pendingAccess = undefined
    }).catch(() => { /* The caller handles the request failure. */ })
  }
  return pendingAccess
}
