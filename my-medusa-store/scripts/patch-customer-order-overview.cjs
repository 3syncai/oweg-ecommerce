const fs = require("node:fs")
const path = require("node:path")
const { buildSync } = require("esbuild")
const root = path.resolve(__dirname, "..")
const dashboard = path.join(root, "node_modules/@medusajs/dashboard")

function replaceOnce(file, before, after, marker) {
  const text = fs.readFileSync(file, "utf8")
  if (text.includes(marker)) return
  if (text.split(before).length !== 2)
    throw new Error(
      `Customer overview patch no longer matches ${file}; review the dashboard upgrade`
    )
  fs.writeFileSync(file, text.replace(before, after))
}

module.exports = function patchCustomerOrderOverview() {
  if (!fs.existsSync(dashboard)) return
  for (const [format, output] of [
    ["esm", "dist/oweg-customer-order-overview.mjs"],
    ["cjs", "dist/oweg-customer-order-overview.cjs"],
    ["esm", "src/oweg-customer-order-overview.js"],
  ]) {
    buildSync({
      absWorkingDir: root,
      entryPoints: ["src/admin/components/customer-order-overview.tsx"],
      outfile: path.join(dashboard, output),
      bundle: true,
      packages: "external",
      format,
      platform: "browser",
      jsx: "automatic",
      target: "es2020",
      logLevel: "silent",
    })
  }
  const file = fs
    .readdirSync(path.join(dashboard, "dist"))
    .find((name) => /^customer-detail-.*\.mjs$/.test(name))
  if (!file) throw new Error("Customer detail bundle not found")
  replaceOnce(
    path.join(dashboard, "dist", file),
    "jsx7(CustomerOrderSection, { customer })",
    "jsx7(OwegCustomerOrderOverview, { customer, FullSection: CustomerOrderSection })",
    "jsx7(OwegCustomerOrderOverview,"
  )
  const bundle = path.join(dashboard, "dist", file)
  if (
    !fs
      .readFileSync(bundle, "utf8")
      .includes("import { CustomerOrderOverview as OwegCustomerOrderOverview }")
  )
    fs.appendFileSync(
      bundle,
      '\nimport { CustomerOrderOverview as OwegCustomerOrderOverview } from "./oweg-customer-order-overview.mjs";\n'
    )
  replaceOnce(
    path.join(dashboard, "dist/app.js"),
    "(0, import_jsx_runtime399.jsx)(CustomerOrderSection, { customer })",
    '(0, import_jsx_runtime399.jsx)(require("./oweg-customer-order-overview.cjs").CustomerOrderOverview, { customer, FullSection: CustomerOrderSection })',
    'require("./oweg-customer-order-overview.cjs").CustomerOrderOverview'
  )
  const source = path.join(
    dashboard,
    "src/routes/customers/customer-detail/customer-detail.tsx"
  )
  replaceOnce(
    source,
    "<CustomerOrderSection customer={customer} />",
    "<OwegCustomerOrderOverview customer={customer} FullSection={CustomerOrderSection} />",
    "<OwegCustomerOrderOverview"
  )
  if (
    !fs
      .readFileSync(source, "utf8")
      .includes("import { CustomerOrderOverview as OwegCustomerOrderOverview }")
  )
    fs.appendFileSync(
      source,
      '\nimport { CustomerOrderOverview as OwegCustomerOrderOverview } from "../../../oweg-customer-order-overview"\n'
    )
  console.log("[admin] Customer order overview patch ready")
  require("./patch-order-summary.cjs")()
  require("./patch-order-list.cjs")()
}
if (require.main === module) module.exports()
