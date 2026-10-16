const fs = require("node:fs")
const path = require("node:path")
const { buildSync } = require("esbuild")
const root = path.resolve(__dirname, "..")
const dashboard = path.join(root, "node_modules/@medusajs/dashboard")

function replace(file, before, after) {
  const text = fs.readFileSync(file, "utf8")
  if (text.includes(after)) return
  if (text.split(before).length !== 2)
    throw new Error(`Order list patch no longer matches ${file}; review the dashboard upgrade`)
  fs.writeFileSync(file, text.replace(before, after))
}

module.exports = function patchOrderList() {
  if (!fs.existsSync(dashboard)) return
  for (const [format, output] of [["esm", "dist/oweg-order-list.mjs"], ["cjs", "dist/oweg-order-list.cjs"], ["esm", "src/oweg-order-list.js"]]) {
    buildSync({
      absWorkingDir: root, entryPoints: ["src/admin/components/order-list-columns.tsx"],
      outfile: path.join(dashboard, output), bundle: true, packages: "external",
      format, platform: "browser", jsx: "automatic", target: "es2020", logLevel: "silent",
    })
  }
  const chunk = fs.readdirSync(path.join(dashboard, "dist")).find((name) => /^order-list-.*\.mjs$/.test(name))
  if (!chunk) throw new Error("Order list dashboard bundle not found")
  const esm = path.join(dashboard, "dist", chunk)
  replace(esm, "const columns = useOrderTableColumns({});", "const columns = useOwegOrderListColumns(useOrderTableColumns({}), orders);")
  if (!fs.readFileSync(esm, "utf8").includes('from "./oweg-order-list.mjs"'))
    fs.appendFileSync(esm, '\nimport { useOwegOrderListColumns } from "./oweg-order-list.mjs";\n')
  replace(path.join(dashboard, "dist/app.js"),
    "const columns = useOrderTableColumns({});",
    'const columns = require("./oweg-order-list.cjs").useOwegOrderListColumns(useOrderTableColumns({}), orders);')
  const source = path.join(dashboard, "src/routes/orders/order-list/components/order-list-table/order-list-table.tsx")
  replace(source, "const columns = useOrderTableColumns({})", "const columns = useOwegOrderListColumns(useOrderTableColumns({}), orders)")
  if (!fs.readFileSync(source, "utf8").includes('from "../../../../../oweg-order-list"'))
    fs.appendFileSync(source, '\nimport { useOwegOrderListColumns } from "../../../../../oweg-order-list"\n')
  console.log("[admin] Order list columns patch ready")
}
if (require.main === module) module.exports()
