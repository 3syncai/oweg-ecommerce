// UI grace only. Server authorization still checks every privileged request.
export const ADMIN_ACCESS_REFRESH_MS = 30_000
export const ADMIN_ACCESS_MAX_STALE_MS = 90_000

export function accessRefreshFailure(status: number | undefined, hasVerifiedAccess: boolean, verifiedAt: number, now: number): "retain" | "block" | "expired" {
  if (status === 401 || status === 403) return "expired"
  const transient = status === undefined || status === 408 || status === 429 || status >= 500
  return transient && hasVerifiedAccess && now - verifiedAt < ADMIN_ACCESS_MAX_STALE_MS ? "retain" : "block"
}

export function accessRetryDelay(failures: number): number {
  return Math.min(30_000, 5_000 * 2 ** Math.min(Math.max(failures - 1, 0), 3))
}
