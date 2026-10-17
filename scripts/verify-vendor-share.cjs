const assert = require("node:assert/strict")
const { NextRequest } = require("../vendor-portal/node_modules/next/server")
const { middleware } = require("../vendor-portal/middleware.ts")
const { safeVendorRedirect } = require("../vendor-portal/lib/vendor-redirect.ts")

async function main() {
  global.fetch = async () => ({ ok: true, json: async () => ({ settings: { siteStatus: "live" } }) })
  const path = "/products/new?shared_product=prod_123&share=opaque_token"
  const loggedOut = await middleware(new NextRequest(`http://localhost:4000${path}`))
  const login = new URL(loggedOut.headers.get("location"))
  assert.equal(login.pathname, "/login")
  assert.equal(login.searchParams.get("redirect"), path)
  assert.equal(safeVendorRedirect(login.searchParams.get("redirect")), path)
  const alreadyLoggedIn = await middleware(new NextRequest(`http://localhost:4000/login?${new URLSearchParams({ redirect: path })}`, { headers: { cookie: "vendor_token=present" } }))
  assert.equal(new URL(alreadyLoggedIn.headers.get("location")).pathname, "/products/new")
  assert.equal(new URL(alreadyLoggedIn.headers.get("location")).searchParams.get("share"), "opaque_token")
  const destination = await middleware(new NextRequest(`http://localhost:4000${path}`, { headers: { cookie: "vendor_token=present" } }))
  assert.equal(destination.headers.get("location"), null)
  for (const unsafe of ["https://other.example", "//other.example", "/\\other.example", "/\nother.example", null]) assert.equal(safeVendorRedirect(unsafe), "/dashboard")
  console.log("Vendor share redirect checks passed: logged out, logged in, query retention, external redirects blocked")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
