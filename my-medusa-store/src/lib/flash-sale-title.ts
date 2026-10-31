/** Keep campaign headings bounded plain text; React renders them without HTML. */
export function normalizeFlashSaleTitle(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('Flash sale title must be text')
  const title = value.trim()
  if (title.length > 120) throw new Error('Flash sale title must be 120 characters or fewer')
  return title || null
}
