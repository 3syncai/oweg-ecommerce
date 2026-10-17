const fs = require("node:fs")
const path = require("node:path")
const { buildSync } = require("esbuild")
const root = path.resolve(__dirname, "..")
const dashboard = path.join(root, "node_modules/@medusajs/dashboard")

module.exports = function patchProductList() {
  if (!fs.existsSync(dashboard)) return
  for (const [format, output] of [["esm", "dist/oweg-product-list.mjs"], ["cjs", "dist/oweg-product-list.cjs"], ["esm", "src/oweg-product-list.js"]])
    buildSync({ absWorkingDir: root, entryPoints: ["src/admin/components/product-list-columns.tsx"], outfile: path.join(dashboard, output), bundle: true, packages: "external", format, platform: "browser", jsx: "automatic", target: "es2020", logLevel: "silent" })
  const chunk = fs.readdirSync(path.join(dashboard, "dist")).find(name => /^product-list-.*\.mjs$/.test(name))
  if (!chunk) throw new Error("Product list dashboard bundle not found")
  for (const [file, before, after, dependency] of [
    [path.join(dashboard, "dist", chunk), "const columns = useColumns();", "const columns = useOwegProductListColumns(useColumns(), products);", 'import { useOwegProductListColumns } from "./oweg-product-list.mjs";'],
    [path.join(dashboard, "dist/app.js"), "const columns = useColumns();", 'const columns = require("./oweg-product-list.cjs").useOwegProductListColumns(useColumns(), products);', ""],
    [path.join(dashboard, "src/routes/products/product-list/components/product-list-table/product-list-table.tsx"), "const columns = useColumns()", "const columns = useOwegProductListColumns(useColumns(), products)", 'import { useOwegProductListColumns } from "../../../../../oweg-product-list"'],
  ]) {
    let text = fs.readFileSync(file, "utf8")
    if (text.includes(after)) continue
    if (text.split(before).length !== 2) throw new Error(`Product table patch no longer matches ${file}; review dashboard upgrade`)
    text = text.replace(before, after)
    fs.writeFileSync(file, text + (dependency ? `\n${dependency}\n` : ""))
  }
  console.log("[admin] Product SKU and share columns ready")
}
if (require.main === module) module.exports()
