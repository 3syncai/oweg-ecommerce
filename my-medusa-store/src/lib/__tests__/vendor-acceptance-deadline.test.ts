import { test } from "node:test"
import assert from "node:assert/strict"
import { acceptanceDeadline, isAcceptanceOverdue, reassignmentAcceptanceDeadline, withRecoveredAcceptanceDeadline } from "../vendor-acceptance-deadline"

test("acceptance expires exactly 48 hours after assignment", () => {
  const assigned = "2026-10-18T10:00:00.000Z"
  const deadline = acceptanceDeadline(assigned)
  assert.equal(deadline, "2026-10-20T10:00:00.000Z")
  assert.equal(isAcceptanceOverdue({ stage: "to_accept", acceptance_deadline_at: deadline },
    new Date("2026-10-20T09:59:59.999Z")), false)
  assert.equal(isAcceptanceOverdue({ stage: "to_accept", acceptance_deadline_at: deadline },
    new Date(deadline)), true)
})

test("accepted orders never time out", () => {
  const deadline = "2026-10-20T10:00:00.000Z"
  assert.equal(isAcceptanceOverdue({ stage: "to_pack", acceptance_deadline_at: deadline },
    new Date("2026-10-21T00:00:00.000Z")), false)
  assert.equal(isAcceptanceOverdue({ stage: "to_accept", accepted_at: "2026-10-19T00:00:00.000Z",
    acceptance_deadline_at: deadline }, new Date("2026-10-21T00:00:00.000Z")), false)
})

test("missing replacement deadline uses the latest assignment to that vendor", () => {
  const metadata = { vendor_reassignment_history: [
    { from_vendor_id: "a", to_vendor_id: "b", at: "2026-10-16T10:00:00.000Z" },
    { from_vendor_id: "c", to_vendor_id: "b", at: "2026-10-18T10:00:00.000Z" },
  ] }
  assert.deepEqual(reassignmentAcceptanceDeadline(metadata, "b"), {
    assigned_at: "2026-10-18T10:00:00.000Z",
    acceptance_deadline_at: "2026-10-20T10:00:00.000Z",
  })
  assert.equal(reassignmentAcceptanceDeadline(metadata, "a"), null)
  assert.equal(reassignmentAcceptanceDeadline({ vendor_reassignment_history: [
    { to_vendor_id: "b", at: "invalid" },
  ] }, "b"), null)
  assert.equal(withRecoveredAcceptanceDeadline({ stage: "to_accept", acceptance_deadline_at: null },
    metadata, "b").acceptance_deadline_at, "2026-10-20T10:00:00.000Z")
  assert.equal(withRecoveredAcceptanceDeadline({ stage: "to_pack", acceptance_deadline_at: null },
    metadata, "b").acceptance_deadline_at, null)
})

test("paid initial assignment recovers the 48 hour deadline from conversion time", () => {
  const metadata = {
    razorpay_payment_status: "captured",
    checkout_convert_authorized_at: "2026-10-19T12:23:57.745Z",
  }
  const workflow = withRecoveredAcceptanceDeadline({ stage: "to_accept" }, metadata, "test",
    "2026-10-19T12:23:29.765Z")
  assert.equal(workflow.assigned_at, "2026-10-19T12:23:57.745Z")
  assert.equal(workflow.acceptance_deadline_at, "2026-10-21T12:23:57.745Z")
  assert.equal(withRecoveredAcceptanceDeadline({ stage: "to_accept" }, {
    ...metadata, razorpay_payment_status: "pending_recording",
  }, "test", "2026-10-19T12:23:29.765Z").acceptance_deadline_at, undefined)
})
