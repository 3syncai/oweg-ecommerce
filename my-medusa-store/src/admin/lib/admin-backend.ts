export function getAdminBackendUrl(): string {
  if (typeof window === "undefined") return ""
  return (
    process.env.BACKEND_URL ||
    process.env.MEDUSA_ADMIN_BACKEND_URL ||
    window.location.origin
  ).replace(/\/$/, "")
}

export async function readAdminApiError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; error?: string }
    const detail = data.message || data.error
    if (detail) return `${fallback} (${res.status}): ${detail}`
  } catch {
    /* response body was not JSON */
  }
  return `${fallback} (${res.status})`
}
