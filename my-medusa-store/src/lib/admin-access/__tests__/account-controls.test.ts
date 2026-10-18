import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { Pool } from "pg"
import { deleteAdminAccount } from "../repository"
import { enforceAdminAccess } from "../middleware"
import { deleteAccountInput, accountInput } from "../validation"
import { adminPasswordRequirements, canDeleteAdminAccount } from "../../../shared/admin-account-controls"
import type { AdminAccess } from "../../../shared/admin-access"

const actor: AdminAccess = { user_id: "admin_actor", kind: "superadmin", active: true, role_id: null, role_name: null, responsibilities: "", permissions: [] }

test("deletion requires an exact, explicit confirmation", () => {
  for (const confirmation of [undefined, "", "confirm", " CONFIRM", "CONFIRM ", true]) {
    assert.equal(deleteAccountInput.safeParse({ confirmation }).success, false)
  }
  assert.equal(deleteAccountInput.safeParse({ confirmation: "CONFIRM", user_id: "other" }).success, false)
  assert.equal(deleteAccountInput.safeParse({ confirmation: "CONFIRM" }).success, true)
})

test("self and all superadmin accounts are protected; only active superadmins may delete", () => {
  const target = { user_id: "admin_other", kind: "subadmin" as const }
  assert.equal(canDeleteAdminAccount(actor, target), true)
  assert.equal(canDeleteAdminAccount(actor, { ...target, kind: "unassigned" }), true)
  assert.equal(canDeleteAdminAccount(actor, { ...target, user_id: actor.user_id }), false)
  assert.equal(canDeleteAdminAccount(actor, { ...target, kind: "superadmin" }), false)
  assert.equal(canDeleteAdminAccount({ ...actor, active: false }, target), false)
  assert.equal(canDeleteAdminAccount({ ...actor, kind: "subadmin" }, target), false)
})

test("password hints agree with backend boundaries and optional generation", () => {
  const body = { email: "test@example.test", role_id: "role_test" }
  assert.equal(accountInput.safeParse(body).success, true)
  for (const length of [1, 11, 12, 128, 129]) {
    const password = "a".repeat(length)
    assert.equal(adminPasswordRequirements(password).every(rule => rule.met), accountInput.safeParse({ ...body, password }).success)
  }
})

test("delete endpoint service authorizes and rolls back failed deletions without affecting another account", async () => {
  let actorKind = "superadmin", active = true, targetKind = "subadmin", exists = true, auditFails = false
  const calls: { sql: string; values?: unknown[] }[] = []
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values })
      if (sql.includes('FROM "user" u')) return { rows: [{ ...actor, user_id: values?.[0], kind: values?.[0] === actor.user_id ? actorKind : targetKind, active }] }
      if (sql.includes("FROM oweg_admin_permission")) return { rows: [] }
      if (sql.startsWith('SELECT id FROM "user"')) return { rows: exists ? [{ id: "admin_target" }] : [] }
      if (sql.startsWith("SELECT kind")) return { rows: targetKind === "unassigned" ? [] : [{ kind: targetKind }] }
      if (auditFails && sql.includes("INSERT INTO oweg_admin_audit")) throw new Error("Audit unavailable")
      return { rows: [] }
    },
    connect: async () => ({ query: pool.query, release: () => {} }),
  }
  const previousUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1/unused_test_mock"
  const queryStub = mock.method(Pool.prototype, "query", pool.query as any)
  const connectStub = mock.method(Pool.prototype, "connect", pool.connect as any)
  const deletes = () => calls.filter(call => call.sql.startsWith('UPDATE "user"'))
  try {
    let status = 200, response: any, continued = false
    await enforceAdminAccess({ method: "DELETE", originalUrl: "/admin/users/admin_target", auth_context: { actor_id: actor.user_id, actor_type: "user" } } as any,
      { setHeader: () => {}, status: (value: number) => { status = value; return { json: (value: unknown) => { response = value } } } } as any,
      () => { continued = true })
    assert.equal(status, 403)
    assert.match(response.message, /required CONFIRM/)
    assert.equal(continued, false)
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "confirm" }), /Invalid fields/)
    await assert.rejects(deleteAdminAccount(actor.user_id, actor.user_id, { confirmation: "CONFIRM" }), /own account/)
    actorKind = "subadmin"
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" }), /Only the superadmin/)
    actorKind = "superadmin"; active = false
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" }), /Only the superadmin/)
    active = true; targetKind = "superadmin"
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" }), /cannot be deleted/)
    targetKind = "subadmin"; exists = false
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" }), /not found/)
    assert.equal(deletes().length, 0)
    exists = true
    for (const kind of ["subadmin", "unassigned"]) {
      targetKind = kind; calls.length = 0
      await deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" })
      assert.deepEqual(deletes().map(call => call.values), [["admin_target"]])
      assert.ok(calls.some(call => call.sql.includes("pg_advisory_xact_lock")))
      assert.ok(calls.some(call => call.sql.includes("token_valid_after")))
      assert.ok(calls.some(call => call.values?.[2] === "account.deleted"))
      assert.equal(calls.at(-1)?.sql, "COMMIT")
    }
    auditFails = true; calls.length = 0
    await assert.rejects(deleteAdminAccount(actor.user_id, "admin_target", { confirmation: "CONFIRM" }), /Audit unavailable/)
    assert.equal(calls.at(-1)?.sql, "ROLLBACK")
    assert.ok(!calls.some(call => call.sql === "COMMIT"))
  } finally {
    queryStub.mock.restore(); connectStub.mock.restore()
    if (previousUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousUrl
  }
})
