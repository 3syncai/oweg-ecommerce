import { test } from "node:test"
import assert from "node:assert/strict"
import { acceptanceDeadline, isAcceptanceOverdue } from "../vendor-acceptance-deadline"

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
