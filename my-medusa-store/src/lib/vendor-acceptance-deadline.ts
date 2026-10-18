export const VENDOR_ACCEPTANCE_HOURS = 48

export function acceptanceDeadline(assignedAt: string): string {
  const start = new Date(assignedAt).getTime()
  if (!Number.isFinite(start)) throw new Error("Invalid vendor assignment time")
  return new Date(start + VENDOR_ACCEPTANCE_HOURS * 60 * 60 * 1000).toISOString()
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
