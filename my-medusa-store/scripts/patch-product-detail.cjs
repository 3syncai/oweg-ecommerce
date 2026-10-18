const fs = require("node:fs")
const path = require("node:path")

/** Hide dashboard-only product panels without changing product configuration. */
module.exports = function patchProductDetail() {
  const dashboard = path.resolve(__dirname, "../node_modules/@medusajs/dashboard")
  if (!fs.existsSync(dashboard)) return

  const esmName = fs.readdirSync(path.join(dashboard, "dist"))
    .filter(name => /^product-detail-.*\.mjs$/.test(name))
    .find(name => {
      const source = fs.readFileSync(path.join(dashboard, "dist", name), "utf8")
      return source.includes("jsx10(ProductSalesChannelSection, { product })") || source.includes("// OWEG: hide product detail option, sales channel, and shipping profile panels")
    })
  if (!esmName) throw new Error("Product detail dashboard bundle not found")

  const files = [
    {
      path: path.join(dashboard, "dist", esmName),
      sections: ["ProductOptionSection", "ProductSalesChannelSection", "ProductShippingProfileSection"].map(name => `/* @__PURE__ */ jsx10(${name}, { product }),`),
    },
    {
      path: path.join(dashboard, "dist", "app.js"),
      sections: ["ProductOptionSection", "ProductSalesChannelSection", "ProductShippingProfileSection"].map(name => `/* @__PURE__ */ (0, import_jsx_runtime129.jsx)(${name}, { product }),`),
    },
    {
      path: path.join(dashboard, "src/routes/products/product-detail/product-detail.tsx"),
      sections: ["ProductOptionSection", "ProductSalesChannelSection", "ProductShippingProfileSection"].map(name => `<${name} product={product} />`),
    },
  ]

  const marker = "// OWEG: hide product detail option, sales channel, and shipping profile panels"
  for (const file of files) {
    let source = fs.readFileSync(file.path, "utf8")
    if (source.includes(marker)) continue
    for (const section of file.sections) {
      if (source.split(section).length !== 2) throw new Error(`Product detail patch no longer matches ${file.path}: ${section}`)
      source = source.replace(section, "")
    }
    fs.writeFileSync(file.path, `${source}\n${marker}\n`)
  }
  console.log("[admin] Product detail panels hidden")
}

if (require.main === module) module.exports()
