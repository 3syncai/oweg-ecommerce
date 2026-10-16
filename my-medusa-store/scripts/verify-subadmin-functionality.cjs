/** Uses the eight configured logins; writes only disposable QA groups/brands/campaigns. */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { randomUUID } = require("node:crypto")
const base = process.env.RBAC_BASE_URL || "http://localhost:9000"
const stored = fs.readFileSync(".local-admin/subadmin-credentials.txt", "utf8")
const credentials = new Map(
  stored
    .split(/\r?\n/)
    .filter((line) => line.includes(" | "))
    .map((line) => line.split(" | ").map((value) => value.trim()))
)
let checks = 0
async function request(
  path,
  token,
  { body, method = body === undefined ? "GET" : "POST", expected = 200 } = {}
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      `${method} ${path}: expected JSON, received ${response.status} ${response.headers.get("content-type")}`
    )
  }
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${data.message || response.status}`
  )
  checks++
  return data
}
async function login(name) {
  const email = `${name}@oweg.com`
  assert.ok(credentials.has(email), `Missing private credential for ${email}`)
  return (
    await request("/auth/user/emailpass", null, {
      body: { email, password: credentials.get(email) },
    })
  ).token
}
async function disposableCrud(path, key, token, create, update) {
  let id
  try {
    const created = await request(path, token, { body: create })
    id = created[key].id
    assert.ok(id)
    const updated = await request(`${path}/${id}`, token, { body: update })
    for (const [field, value] of Object.entries(update))
      assert.equal(updated[key][field], value)
    await request(`${path}/${id}`, token)
  } finally {
    if (id) await request(`${path}/${id}`, token, { method: "DELETE" })
  }
}
async function main() {
  const suffix = randomUUID()
  const tokens = {}
  const groups = [
    [
      "customer",
      ["/admin/customers?limit=2", "/admin/customer-groups?limit=1"],
    ],
    [
      "product",
      [
        "/admin/products?limit=1",
        "/admin/collections?limit=1",
        "/admin/product-categories?limit=1",
        "/admin/price-lists?limit=1",
      ],
    ],
    [
      "order",
      [
        "/admin/orders?limit=2",
        "/admin/draft-orders?limit=1",
        "/admin/packet-booking?limit=1",
        "/admin/plugins",
        "/admin/refund-reasons",
        "/admin/returns?limit=1",
        "/admin/claims?limit=1",
        "/admin/exchanges?limit=1",
      ],
    ],
    [
      "returns",
      ["/admin/return-requests", "/admin/return-packet-booking?limit=1"],
    ],
    ["vendor", ["/admin/vendors/all", "/admin/vendors/pending"]],
    [
      "marketing",
      [
        "/admin/flash-sale",
        "/admin/featured-brands",
        "/admin/mega-menu-banners",
        "/admin/promotions?limit=1",
        "/admin/campaigns?limit=1",
      ],
    ],
    [
      "accounting",
      [
        "/admin/vendor-payouts",
        "/admin/vendor-commission",
        "/admin/vendor-reports",
        "/admin/vendor-marketplace-tax",
      ],
    ],
    ["partner", ["/admin/affiliate/admins"]],
  ]
  for (const [name, paths] of groups) {
    const token = (tokens[name] = await login(name))
    await request("/admin/access/me", token)
    for (const path of paths) await request(path, token)
    for (const path of [
      "/admin/access/users",
      "/admin/access/roles",
      "/admin/access/activity",
      "/admin/api-keys",
    ])
      await request(path, token, { expected: 403 })
    console.log(`PASS ${name}: real login, section APIs and access isolation`)
  }
  const customers = (await request("/admin/customers?limit=2", tokens.customer))
    .customers
  for (const { id } of customers) {
    await request(`/admin/customers/${id}?fields=+*addresses`, tokens.customer)
    await request(`/admin/customers/${id}/grouping`, tokens.customer)
    await request(`/admin/customers/${id}/gst`, tokens.customer)
    const summary = await request(
      `/admin/customers/${id}/order-summary`,
      tokens.customer
    )
    const reference = await request(
      `/admin/orders?customer_id=${id}&limit=10&fields=id,display_id,total&order=-created_at`,
      tokens.order
    )
    assert.equal(summary.count, reference.count)
    assert.deepEqual(
      summary.orders.map((order) => order.id).sort(),
      reference.orders.map((order) => order.id).sort()
    )
    for (const order of summary.orders) {
      assert.deepEqual(Object.keys(order).sort(), [
        "created_at",
        "currency_code",
        "display_id",
        "fulfillment_status",
        "id",
        "payment_status",
        "status",
        "total",
      ])
      assert.equal(
        Number(order.total),
        Number(reference.orders.find((item) => item.id === order.id).total)
      )
    }
    if (summary.count > 10) {
      const next = await request(
        `/admin/customers/${id}/order-summary?offset=10&limit=10`,
        tokens.customer
      )
      assert.ok(next.orders.length)
      assert.ok(
        next.orders.every(
          (order) => !summary.orders.some((first) => first.id === order.id)
        )
      )
    }
    for (const query of [
      "fields=*items",
      "customer_id=other",
      "limit=0",
      "limit=51",
      "offset=-1",
    ])
      await request(
        `/admin/customers/${id}/order-summary?${query}`,
        tokens.customer,
        { expected: 400 }
      )
    if (summary.orders[0])
      await request(`/admin/orders/${summary.orders[0].id}`, tokens.customer, {
        expected: 403,
      })
  }
  await request(
    "/admin/customers/cus_nonexistent_qa/order-summary",
    tokens.customer,
    { expected: 404 }
  )
  await request("/admin/orders?limit=1", tokens.customer, { expected: 403 })
  await request(
    `/admin/customers/${customers[0].id}/order-summary`,
    tokens.marketing,
    { expected: 403 }
  )
  const product = (await request("/admin/products?limit=1", tokens.product))
    .products[0]
  await request(
    `/admin/products/${product.id}?fields=+*variants,+*options,+*categories`,
    tokens.product
  )
  await request(
    `/admin/products/${product.id}/variants?limit=10`,
    tokens.product
  )
  const promotion = (
    await request("/admin/promotions?limit=1", tokens.marketing)
  ).promotions[0]
  if (promotion) {
    await request(`/admin/promotions/${promotion.id}`, tokens.marketing)
    for (const section of ["rules", "target-rules", "buy-rules"])
      await request(
        `/admin/promotions/${promotion.id}/${section}`,
        tokens.marketing
      )
  }
  const returns = (await request("/admin/return-requests", tokens.returns))
    .return_requests
  if (returns[0])
    await request(`/admin/return-requests/${returns[0].id}`, tokens.returns)
  const vendors = (await request("/admin/vendors/all", tokens.vendor)).vendors
  if (vendors[0]) {
    await request(`/admin/vendors/${vendors[0].id}`, tokens.vendor)
    await request(`/admin/vendors/${vendors[0].id}/commission`, tokens.vendor, {
      method: "PUT",
      body: {},
      expected: 403,
    })
    await request(
      `/admin/vendors/${vendors[0].id}/commission`,
      tokens.accounting,
      { method: "PUT", body: {}, expected: 400 }
    )
  }
  await request("/admin/affiliate/admins", tokens.partner, {
    body: {},
    expected: 400,
  })
  await disposableCrud(
    "/admin/customer-groups",
    "customer_group",
    tokens.customer,
    { name: `QA group ${suffix}` },
    { name: `QA group updated ${suffix}` }
  )
  await disposableCrud(
    "/admin/collections",
    "collection",
    tokens.product,
    { title: `QA brand ${suffix}` },
    { title: `QA brand updated ${suffix}` }
  )
  await disposableCrud(
    "/admin/campaigns",
    "campaign",
    tokens.marketing,
    { name: `QA campaign ${suffix}`, campaign_identifier: `qa-${suffix}` },
    { name: `QA campaign updated ${suffix}` }
  )
  console.log(
    `PASS ${checks} HTTP checks, customer scope/projection/pagination, detail dependencies and disposable create/edit/delete flows. No existing business record was changed.`
  )
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
