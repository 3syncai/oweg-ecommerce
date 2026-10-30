const { spawnSync } = require("node:child_process")
const path = require("node:path")
const { randomBytes } = require("node:crypto")
const fs = require("node:fs")
const { gzipSync } = require("node:zlib")
// The backend build command remains separate; this emits only the static admin.
process.env.NODE_ENV = "production"
// Static-only compilation loads medusa-config but never starts authentication
// or connects to the database. Do not require copying backend secrets to Vercel.
const buildEnv = { ...process.env }
for (const key of ["JWT_SECRET", "COOKIE_SECRET"]) buildEnv[key] = randomBytes(32).toString("hex")
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
  console.log(`[admin] Production entry: ${bundle.length} bytes (${gzipSync(bundle).length} gzip)`)
}
