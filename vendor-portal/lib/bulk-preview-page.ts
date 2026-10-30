export const BULK_PREVIEW_PAGE_SIZE = 50

/** Display offsets only. The full row collection remains the source of truth. */
export function bulkPreviewPage(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / BULK_PREVIEW_PAGE_SIZE))
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1))
  const start = (page - 1) * BULK_PREVIEW_PAGE_SIZE
  return { page, pageCount, start, end: Math.min(total, start + BULK_PREVIEW_PAGE_SIZE) }
}
