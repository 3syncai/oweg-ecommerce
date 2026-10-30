import type { AdminAccess } from "../../shared/admin-access"

let pendingAccess: Promise<AdminAccess> | undefined

export class AdminAccessRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "AdminAccessRequestError" }
}

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
  const data = (await response.json().catch(() => ({}))) || {}
  if (!response.ok) {
    if (path.startsWith("/roles") && /^Invalid fields:.*permissions\.\d/.test(data.message || ""))
      throw new Error("The Medusa backend rejected the selected responsibilities. Update and restart the Medusa backend from the same revision as the admin app, then refresh. Your selection has been kept.")
    throw new AdminAccessRequestError(data.message || "Unable to complete this request", response.status)
  }
  return data
}

export function currentAdminAccess(): Promise<AdminAccess> {
  if (!pendingAccess) {
    const request = accessRequest<{ access: AdminAccess }>("/me").then(result => {
      if (!result.access?.user_id || !Array.isArray(result.access.permissions)) throw new AdminAccessRequestError("Invalid admin access response", 502)
      return result.access
    })
    pendingAccess = request
    void request.finally(() => {
      if (pendingAccess === request) pendingAccess = undefined
    }).catch(() => { /* The caller handles the request failure. */ })
  }
  return pendingAccess
}
