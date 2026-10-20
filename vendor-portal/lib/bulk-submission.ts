import { resolveBulkListing } from "./bulk-pricing"
import { brandReady, type ParsedRow } from "./bulk-upload"
import type { BrandAuthState } from "./bulk-brand-authorization"

/** The same blockers drive the button, its explanation, and the submit guard. */
export function bulkSubmissionIssues(
  rows: ParsedRow[],
  images: Record<string, { status: string }>,
  requiredImages: string[],
  uploadingImages: boolean,
  brands: ReadonlyArray<{ key: string; display: string }>,
  authorizations: Record<string, BrandAuthState>,
): string[] {
  const issues: string[] = []
  const invalid = rows.filter(row => row.errors.length)
  if (invalid.length) issues.push(`Fix ${invalid.length} row(s) with errors in the product table.`)
  const pending = rows.filter(row => !row.errors.length && row.status !== "success")
  if (!pending.length) issues.push("No products are ready to submit. Add valid rows or start a new upload.")
  const pricing = new Set<string>()
  for (const row of pending) {
    try { resolveBulkListing(row) } catch (cause) {
      if (cause instanceof Error) pricing.add(cause.message)
      else pricing.add(`Review the listing price and refresh logistics for ${row.title}.`)
    }
  }
  issues.push(...pricing)
  if (uploadingImages) issues.push("Wait for product images to finish uploading.")
  const missing = requiredImages.filter(key => images[key]?.status !== "uploaded").length
  if (missing) issues.push(`Upload ${missing} referenced product image(s).`)
  for (const brand of brands) {
    const state = authorizations[brand.key]
    if (brandReady(state)) continue
    if (!state || state.status === "checking") issues.push(`Wait for the authorization check for ${brand.display}.`)
    else if (state.status === "preparing" || state.status === "uploading") issues.push(`Wait for the letter for ${brand.display} to finish preparing.`)
    else issues.push(`Choose a brand authorization letter for ${brand.display}.${state.status === "error" ? ` ${state.message}` : ""}`)
  }
  return issues
}
