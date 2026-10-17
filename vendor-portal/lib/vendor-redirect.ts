/** Restrict post-login destinations to this portal; searchParams already decodes once. */
export function safeVendorRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/dashboard"
  return value
}
