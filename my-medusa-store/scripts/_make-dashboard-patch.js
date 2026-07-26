const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

const origRoot = path.join(os.tmpdir(), "medusa-dash-orig", "package")
const modRoot = path.join("node_modules", "@medusajs", "dashboard")
const files = [
  "dist/app.js",
  "dist/chunk-HQKKXLCX.mjs",
  "dist/inventory-list-I7IXI4KC.mjs",
  "src/components/layout/main-layout/main-layout.tsx",
  "src/routes/inventory/inventory-list/components/inventory-list-table.tsx",
  "src/routes/inventory/inventory-list/components/use-inventory-table-columns.tsx",
]

function normalizeDiff(diff, unix) {
  const prefix = `node_modules/@medusajs/dashboard/${unix}`
  const lines = diff.split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      out.push(`diff --git a/${prefix} b/${prefix}`)
      continue
    }
    if (line.startsWith("--- ")) {
      out.push(`--- a/${prefix}`)
      continue
    }
    if (line.startsWith("+++ ")) {
      out.push(`+++ b/${prefix}`)
      continue
    }
    out.push(line)
  }
  return out.join("\n")
}

const parts = []
for (const f of files) {
  const a = path.join(origRoot, f)
  const b = path.join(modRoot, f)
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    console.error("Missing file:", f)
    process.exit(1)
  }
  let diff
  try {
    diff = execSync(`git -c core.autocrlf=false diff --no-index -- "${a}" "${b}"`, {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
    })
  } catch (e) {
    diff = e.stdout || ""
  }
  if (!diff.trim()) {
    console.error("No diff for", f)
    process.exit(1)
  }
  const unix = f.replace(/\\/g, "/")
  const rewritten = normalizeDiff(diff, unix)
  parts.push(rewritten.trimEnd())
  console.log("diff ok:", f, "bytes", rewritten.length)
}

const out = path.join("patches", "@medusajs+dashboard+2.11.3.patch")
fs.mkdirSync("patches", { recursive: true })
fs.writeFileSync(out, parts.join("\n") + "\n")
console.log("wrote", out, "bytes", fs.statSync(out).size)
