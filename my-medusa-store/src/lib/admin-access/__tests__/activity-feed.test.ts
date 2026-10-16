import { test } from "node:test"
import assert from "node:assert/strict"
import {
  activityDescription,
  activityArea,
} from "../../../shared/admin-activity-display"

const event = {
  category: "api",
  action: "api.post",
  method: "POST",
  path: "/admin/customers/cus_1",
  target_id: "cus_1",
  status_code: 200,
}
test("business descriptions distinguish Medusa creates, updates and failed attempts", () => {
  assert.equal(activityDescription(event), "Updated customer")
  assert.equal(
    activityDescription({ ...event, path: "/admin/customers" }),
    "Created customer"
  )
  assert.equal(
    activityDescription({ ...event, status_code: 403 }),
    "Attempted to update customer"
  )
  assert.equal(
    activityDescription({ ...event, method: "DELETE" }),
    "Deleted customer"
  )
  assert.equal(
    activityDescription({
      ...event,
      path: "/admin/return-requests/ret_1/approve",
    }),
    "Approved return request"
  )
  assert.equal(
    activityDescription({ ...event, path: "/admin/vendor-payouts" }),
    "Submitted action for vendor payout"
  )
})
test("human descriptions never expose request values or invent actions for unknown extensions", () => {
  assert.equal(
    activityDescription({
      ...event,
      path: "/admin/new-extension/do-something",
    }),
    "Submitted action for resource"
  )
  assert.equal(
    activityDescription({
      ...event,
      action: "auth.login",
      category: "authentication",
    }),
    "Signed in"
  )
  assert.equal(
    activityDescription({
      ...event,
      action: "credentials.reset",
      category: "access_change",
    }),
    "Reset admin credentials"
  )
  assert.equal(
    activityArea({
      ...event,
      action: "page.viewed",
      category: "navigation",
      path: "/app/oweg-homepage/brands",
    }),
    "Featured brands"
  )
  assert.equal(
    activityDescription({
      ...event,
      action: "page.viewed",
      category: "navigation",
      path: "/app/customers/cus_1",
    }),
    "Viewed customer details"
  )
})
