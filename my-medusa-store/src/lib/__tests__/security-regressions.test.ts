import assert from "node:assert/strict"
import { test, mock } from "node:test"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { Pool } from "pg"
import { boundedUpload } from "../bounded-upload"
import { findShipmentOrder } from "../find-shipment-order"
import { signVendorToken, verifyVendorToken } from "../../api/vendor/_lib/token"
import { POST as logout } from "../../api/vendor/auth/logout/route"

const headers = { "content-type": "multipart/form-data; boundary=test" }
const multipart = (sizes: number[]) => Buffer.from(sizes.map((size, i) =>
  `--test\r\nContent-Disposition: form-data; name="file"; filename="${i}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n${"x".repeat(size)}\r\n`
).join("") + "--test--\r\n")

async function parse(sizes: number[], options = {}) {
  const response = new EventEmitter()
  const parser = boundedUpload(headers, response, options)
  const completed: number[] = []
  parser.on("file", (_name, file) => {
    let size = 0
    file.on("data", chunk => { size += chunk.length })
    file.on("end", () => completed.push(size))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      parser.on("finish", resolve)
      parser.on("error", reject)
      Readable.from([multipart(sizes)]).pipe(parser)
    })
    return completed
  } finally { response.emit("finish") }
}

test("uploads reject oversized streams, aggregate size and excess files", async () => {
  assert.deepEqual(await parse([8], { fileSize: 10 }), [8])
  await assert.rejects(parse([11], { fileSize: 10 }), { statusCode: 413 })
  await assert.rejects(parse([8, 8], { fileSize: 10, totalSize: 12 }), { statusCode: 413 })
  await assert.rejects(parse([1, 1], { files: 1 }), { statusCode: 413 })
  assert.deepEqual(await parse([2]), [2])
})

test("upload admission caps concurrent requests and declared oversize bodies", () => {
  const responses: EventEmitter[] = []
  try {
    assert.throws(() => boundedUpload({ ...headers, "content-length": "999999999" }, new EventEmitter()), { statusCode: 413 })
    for (let i = 0; i < 4; i++) {
      const response = new EventEmitter()
      responses.push(response)
      boundedUpload(headers, response)
    }
    assert.throws(() => boundedUpload(headers, new EventEmitter()), { statusCode: 429 })
  } finally { responses.forEach(response => response.emit("close")) }
  const response = new EventEmitter()
  boundedUpload(headers, response)
  response.emit("finish")
})

test("shipment matching reaches later pages and supports vendor tracking IDs", async () => {
  const orders = Array.from({ length: 1002 }, (_, i) => ({ id: `order_${i}`, metadata: {} as any }))
  orders[1001].metadata = { vendor_order_workflows: { vendor_1: { tracking_number: "later-awb" } } }
  const skips: number[] = []
  const service = { listOrders: async (_filter, config) => {
    skips.push(config.skip)
    assert.deepEqual(config.order, { id: "ASC" })
    return orders.slice(config.skip, config.skip + config.take)
  } }
  assert.equal((await findShipmentOrder(service, "later-awb", ""))?.id, "order_1001")
  assert.deepEqual(skips, [0, 500, 1000])
  orders[0].metadata = { shiprocket_order_id: 123 }
  assert.equal((await findShipmentOrder(service, "", "123"))?.id, "order_0")
  assert.equal(await findShipmentOrder(service, "missing", ""), null)
})

test("logout rejects copied tokens while independent logins remain valid", async () => {
  const previousSecret = process.env.JWT_SECRET
  const previousDb = process.env.DATABASE_URL
  process.env.JWT_SECRET = "test-secret"
  process.env.DATABASE_URL = "postgres://unused"
  const revoked = new Set<string>()
  let unavailable = false
  const query = mock.method(Pool.prototype, "query", async (sql: string, values?: any[]) => {
    if (unavailable) throw new Error("database unavailable")
    if (sql.startsWith("INSERT")) revoked.add(values![0])
    return { rows: sql.startsWith("SELECT") && revoked.has(values![0]) ? [{ exists: 1 }] : [] } as any
  })
  try {
    const claims = { sub: "user_1", vendor_id: "vendor_1", scope: "vendor" as const }
    const token = signVendorToken(claims)
    const other = signVendorToken(claims)
    assert.notEqual(token, other)
    assert.ok(await verifyVendorToken(token))
    const response = { sendStatus: (status: number) => status, status: () => { throw new Error("Unexpected failure") } }
    assert.equal(await logout({ headers: { authorization: `Bearer ${token}` } } as any, response as any), 204)
    assert.equal(await verifyVendorToken(token), null)
    assert.ok(await verifyVendorToken(other))
    assert.equal(await logout({ headers: { authorization: `Bearer ${token}` } } as any, response as any), 204)
    assert.equal(await verifyVendorToken(signVendorToken(claims, 0)), null)
    assert.equal(await verifyVendorToken(token + "tampered"), null)
    unavailable = true
    await assert.rejects(verifyVendorToken(other), /database unavailable/)
  } finally {
    query.mock.restore()
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
    if (previousDb === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDb
  }
})
