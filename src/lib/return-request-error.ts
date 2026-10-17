export function returnRequestError(status: number, payload: unknown): string {
  if (status === 401) return "Please sign in again to submit your return."
  if (status >= 500) return "We couldn’t submit your return right now. Please try again shortly or contact support if it continues."
  const value = typeof payload === "object" && payload !== null
    ? (payload as { message?: unknown; error?: unknown }).message || (payload as { error?: unknown }).error : null
  if (typeof value === "string" && value.length <= 300 && !value.trim().startsWith("{") && !value.includes("\n")) return value
  return "Unable to submit your return. Please check the details and try again."
}
