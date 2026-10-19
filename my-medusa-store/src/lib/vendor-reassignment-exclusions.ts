type ReassignmentEntry = { original_item_id?: string; from_vendor_id?: string }

/** Admin choices can revisit an earlier seller; automatic retries cannot. */
export function reassignmentExcludedVendorIds(
  currentVendorId: string,
  history: ReassignmentEntry[],
  originalItemId: string,
  explicitTarget: boolean
): string[] {
  const earlier = explicitTarget ? [] : history
    .filter(entry => entry.original_item_id === originalItemId)
    .map(entry => entry.from_vendor_id)
    .filter((id): id is string => Boolean(id))
  return [...new Set([currentVendorId, ...earlier])]
}
