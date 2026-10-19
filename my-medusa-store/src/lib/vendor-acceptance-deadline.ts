export const VENDOR_ACCEPTANCE_HOURS = 48

export function acceptanceDeadline(assignedAt: string): string {
  const start = new Date(assignedAt).getTime()
  if (!Number.isFinite(start)) throw new Error("Invalid vendor assignment time")
  return new Date(start + VENDOR_ACCEPTANCE_HOURS * 60 * 60 * 1000).toISOString()
}

/** Recover a missing deadline from the current vendor's recorded reassignment. */
export function reassignmentAcceptanceDeadline(
  metadata: Record<string, any> | null | undefined,
  vendorId: string
): { assigned_at: string; acceptance_deadline_at: string } | null {
  const history = metadata?.vendor_reassignment_history
  if (!Array.isArray(history)) return null
  const assignment = [...history].reverse().find((entry) =>
    entry?.to_vendor_id === vendorId &&
    typeof entry.at === "string" &&
    Number.isFinite(new Date(entry.at).getTime())
  )
  if (!assignment) return null
  const assignedAt = new Date(assignment.at).toISOString()
  return { assigned_at: assignedAt, acceptance_deadline_at: acceptanceDeadline(assignedAt) }
}

export function withRecoveredAcceptanceDeadline<T extends {
  acceptance_deadline_at?: string | null
  accepted_at?: string | null
  stage?: string
  assigned_at?: string | null
}>(workflow: T, metadata: Record<string, any> | null | undefined, vendorId: string,
  orderCreatedAt?: string | null): T {
  if (workflow.acceptance_deadline_at || workflow.accepted_at ||
    (workflow.stage && workflow.stage !== "to_accept")) return workflow
  const reassigned = reassignmentAcceptanceDeadline(metadata, vendorId)
  const paid = metadata?.razorpay_payment_status === "captured" || metadata?.cod_status === "confirmed"
    || metadata?.cod_payment_status === "captured"
  const initialTime = paid && !reassigned
    ? workflow.assigned_at || metadata?.checkout_convert_authorized_at || metadata?.cod_paid_at
      || orderCreatedAt
    : null
  const initialDate = initialTime ? new Date(initialTime) : null
  const recovered = reassigned || (initialDate && Number.isFinite(initialDate.getTime())
    ? { assigned_at: initialDate.toISOString(), acceptance_deadline_at: acceptanceDeadline(initialDate.toISOString()) }
    : null)
  return recovered ? {
    ...workflow,
    assigned_at: workflow.assigned_at || recovered.assigned_at,
    acceptance_deadline_at: recovered.acceptance_deadline_at,
  } : workflow
}

export function isAcceptanceOverdue(workflow: {
  stage?: string
  accepted_at?: string | null
  acceptance_deadline_at?: string | null
}, now = new Date()): boolean {
  if (workflow.accepted_at || (workflow.stage && workflow.stage !== "to_accept")) return false
  const deadline = workflow.acceptance_deadline_at
  return Boolean(deadline && Number.isFinite(new Date(deadline).getTime())
    && new Date(deadline).getTime() <= now.getTime())
}
