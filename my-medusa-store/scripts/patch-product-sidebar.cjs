const fs = require("node:fs")
const path = require("node:path")

/** Group product links and place customer ratings immediately after customer groups. */
module.exports = function patchProductSidebar() {
  const dashboard = path.resolve(__dirname, "../node_modules/@medusajs/dashboard")
  if (!fs.existsSync(dashboard)) return
  const esm = fs.readdirSync(path.join(dashboard, "dist")).filter(name => name.endsWith(".mjs") &&
    fs.readFileSync(path.join(dashboard, "dist", name), "utf8").includes("PROMOTED_EXTENSION_PATHS"))
  if (esm.length !== 1) throw new Error("Expected one dashboard sidebar ESM bundle")
  const files = ["dist/app.js", `dist/${esm[0]}`, "src/components/layout/main-layout/main-layout.tsx"]
  for (const relative of files) {
    const file = path.join(dashboard, relative)
    let original = fs.readFileSync(file, "utf8")
    const ratingsOrder = 'const afterCustomers = ["/oweg-customer-groups", "/customer-insights"]'
    if (!original.includes(ratingsOrder)) {
      const previous = 'const afterCustomers = ["/oweg-customer-groups"]'
      if (original.split(previous).length !== 2) throw new Error(`Customer sidebar order no longer matches ${relative}`)
      original = original.replace(previous, ratingsOrder)
    }
    original = original.replace(/(PROMOTED_EXTENSION_PATHS = \[)([\s\S]*?)(\])/, (match, start, items, end) =>
      items.includes('"/customer-insights"') ? match : `${start}"/customer-insights",${items}${end}`)
    fs.writeFileSync(file, original)
    const marker = "// OWEG grouped product navigation"
    if (original.includes(marker)) continue
    const pattern = /^([ \t]*)\{\r?\n\s*icon: [^\n]*BuildingStorefront[^\n]*\r?\n\s*label: (\w+)\("collections.domain"\),[\s\S]*?to: "\/products",\r?\n\s*items: \[\],?\r?\n\s*\},/gm
    const matches = [...original.matchAll(pattern)]
    if (matches.length !== 1) throw new Error(`Product sidebar patch no longer matches ${relative}; review the dashboard upgrade`)
    const [block, indent, translate] = matches[0]
    const icon = block.match(/icon: ([^\n]*\bTag\b[^\n]*)/)?.[1].replace(/,\r?$/, "")
    if (!icon) throw new Error(`Products icon not found in ${relative}`)
    const replacement = `${indent}${marker}
${indent}{
${indent}  icon: ${icon},
${indent}  label: ${translate}("products.domain"),
${indent}  to: "/products",
${indent}  items: [
${indent}    { label: ${translate}("collections.domain"), to: "/collections" },
${indent}    { label: ${translate}("categories.domain"), to: "/categories" },
${indent}  ],
${indent}},`
    fs.writeFileSync(file, original.replace(block, replacement))
  }
  console.log("[admin] Grouped Products sidebar ready")
}
if (require.main === module) module.exports()
