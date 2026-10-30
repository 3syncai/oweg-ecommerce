const { spawnSync } = require("node:child_process")
const path = require("node:path")
const { randomBytes } = require("node:crypto")
const fs = require("node:fs")
const { gzipSync } = require("node:zlib")
// The backend build command remains separate; this emits only the static admin.
process.env.NODE_ENV = "production"
// Static-only compilation loads medusa-config but never starts authentication
// or connects to the database. Do not require copying backend secrets to Vercel.
const PRODUCTION_API = "https://api.oweg.itshover.com"
function isProxyBackend(url) {
  const value = String(url || "").trim().replace(/\/$/, "")
  if (!value || value === "/api") return true
  try {
    const parsed = new URL(value)
    const pathName = parsed.pathname.replace(/\/$/, "") || "/"
    return pathName === "/api" && /\.vercel\.app$/i.test(parsed.hostname)
  } catch {
    return /\/api$/i.test(value)
  }
}
const buildEnv = { ...process.env }
for (const key of ["JWT_SECRET", "COOKIE_SECRET"]) buildEnv[key] = randomBytes(32).toString("hex")
// Always bake the real API origin. Vercel env often still has
// https://ecomm-admin-ecru.vercel.app/api which keeps login on the flaky rewrite.
buildEnv.NODE_ENV = "production"
buildEnv.MEDUSA_ADMIN_BACKEND_URL = isProxyBackend(buildEnv.MEDUSA_ADMIN_BACKEND_URL)
  ? PRODUCTION_API
  : String(buildEnv.MEDUSA_ADMIN_BACKEND_URL).replace(/\/$/, "")
buildEnv.BACKEND_URL = isProxyBackend(buildEnv.BACKEND_URL)
  ? buildEnv.MEDUSA_ADMIN_BACKEND_URL
  : String(buildEnv.BACKEND_URL).replace(/\/$/, "")
console.log(`[admin] MEDUSA_ADMIN_BACKEND_URL=${buildEnv.MEDUSA_ADMIN_BACKEND_URL}`)
console.log(`[admin] BACKEND_URL=${buildEnv.BACKEND_URL}`)
require("./patch-admin-startup.cjs").apply()
require("./patch-customer-order-overview.cjs")()
const cli = require.resolve("@medusajs/cli/cli.js")
const result = spawnSync(process.execPath, [cli, "build", "--admin-only"], {
  cwd: path.resolve(__dirname, ".."), env: buildEnv, stdio: "inherit",
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
if (result.status === 0) {
  const output = path.resolve(__dirname, "../.medusa/admin")
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8")
  const entry = html.match(/src="([^"]+\.js)"/)
  if (!entry) throw new Error("Admin build has no JavaScript entry")
  const bundle = fs.readFileSync(path.join(output, "assets", path.basename(entry[1])))
  if (bundle.includes(Buffer.from("Download the React DevTools"))) throw new Error("Admin build contains React development runtime")
  const text = bundle.toString("utf8")
  if (text.includes("ecomm-admin-ecru.vercel.app/api")) {
    throw new Error("Admin build still embeds Vercel /api proxy as BACKEND_URL")
  }
  if (!text.includes(PRODUCTION_API)) {
    throw new Error(`Admin build missing ${PRODUCTION_API}`)
  }
  console.log(`[admin] Production entry: ${bundle.length} bytes (${gzipSync(bundle).length} gzip)`)
  console.log(`[admin] Verified direct API origin in bundle`)
}
