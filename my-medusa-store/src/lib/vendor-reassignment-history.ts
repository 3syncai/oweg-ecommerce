export type VendorReassignment = {
  original_item_id: string
  from_item_id: string
  current_item_id: string
  current_order_item_id?: string | null
  from_vendor_id: string
  to_vendor_id: string
}

export function reassignmentHistory(metadata: any): VendorReassignment[] {
  return Array.isArray(metadata?.vendor_reassignment_history) ? metadata.vendor_reassignment_history : []
}

export function latestReassignment(metadata: any, originalItemId: string): VendorReassignment | undefined {
  return [...reassignmentHistory(metadata)].reverse().find(entry => entry.original_item_id === originalItemId)
}

export function matchesReassignedReturnItem(frozen: { id: string; order_item_id: string }, returnedId: string, metadata: any): boolean {
  const latest = latestReassignment(metadata, frozen.id)
  return [frozen.id, frozen.order_item_id, latest?.current_item_id, latest?.current_order_item_id].includes(returnedId)
}
