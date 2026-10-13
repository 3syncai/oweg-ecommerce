// Homepage category rails pass their context through sourceTag, not a Medusa tag.
export function categoryFromSourceTag(sourceTag?: string): {
  id?: string
  handle?: string
} | undefined {
  if (!sourceTag?.startsWith('category:')) return undefined
  const value = sourceTag.slice('category:'.length).trim()
  if (!value) return undefined
  return value.startsWith('pcat_') ? { id: value } : { handle: value }
}
