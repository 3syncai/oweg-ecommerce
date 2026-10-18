import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveRequestedCollection } from "../../../admin/lib/resolve-requested-collection"

const collection = { id: "pcol_polo", title: "Polo Ralph Lauren", handle: "polo-ralph-lauren" }
function responses(items: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string }> = []
  const request = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || "GET" })
    const next = items.shift()
    assert.ok(next, "Unexpected extra request")
    return new Response(JSON.stringify(next.body), { status: next.status || 200 })
  }) as typeof fetch
  return { calls, request }
}
test("two product requests reuse the same existing brand without another POST", async () => {
  const fixture = responses([{ body: { collections: [collection] } }, { body: { collections: [collection] } }])
  for (const title of ["Polo Ralph Lauren", " POLO   RALPH LAUREN "]) {
    const result = await resolveRequestedCollection("http://backend", title, fixture.request)
    assert.equal(result.collection.id, collection.id)
    assert.equal(result.created, false)
  }
  assert.ok(fixture.calls.every(call => call.method === "GET"))
})
test("an existing brand with a custom handle is reused by exact normalized name", async () => {
  const fixture = responses([{ body: { collections: [] } }, { body: { collections: [{ ...collection, handle: "custom-polo" }] } }])
  assert.equal((await resolveRequestedCollection("http://backend", collection.title, fixture.request)).collection.id, collection.id)
  assert.equal(fixture.calls.length, 2)
})
test("missing brand is created once; a concurrent duplicate reuses the winner", async () => {
  for (const concurrent of [false, true]) {
    const fixture = responses([{ body: { collections: [] } }, { body: { collections: [] } }, concurrent ? { status: 400, body: { message: "Handle already exists" } } : { status: 201, body: { collection } }, ...(concurrent ? [{ body: { collections: [collection] } }] : [])])
    const result = await resolveRequestedCollection("http://backend", collection.title, fixture.request)
    assert.equal(result.collection.id, collection.id)
    assert.equal(result.created, !concurrent)
    assert.equal(fixture.calls.filter(call => call.method === "POST").length, 1)
  }
})
test("permission errors remain actionable and never cause a create attempt", async () => {
  const fixture = responses([{ status: 403, body: { message: "You do not have permission for this area" } }])
  await assert.rejects(resolveRequestedCollection("http://backend", collection.title, fixture.request), /permission/)
  assert.equal(fixture.calls.length, 1)
})
test("a matching handle with a different brand name is never silently assigned", async () => {
  const fixture = responses([{ body: { collections: [{ ...collection, title: "Another brand" }] } }])
  await assert.rejects(resolveRequestedCollection("http://backend", collection.title, fixture.request), /different collection/)
  assert.equal(fixture.calls.length, 1)
})
