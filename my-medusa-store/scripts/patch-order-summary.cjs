const fs = require("node:fs")
const path = require("node:path")

module.exports = function patchOrderSummary() {
  const dashboard = path.resolve(
    __dirname,
    "../node_modules/@medusajs/dashboard"
  )
  const source = path.join(
    dashboard,
    "src/routes/orders/order-detail/components/order-summary-section/order-summary-section.tsx"
  )
  const bundle = fs
    .readdirSync(path.join(dashboard, "dist"))
    .find((name) => /^order-detail-.*\.mjs$/.test(name))
  if (!bundle) throw new Error("Order detail bundle not found")
  for (const file of [
    source,
    path.join(dashboard, "dist", bundle),
    path.join(dashboard, "dist/app.js"),
  ]) {
    const text = fs.readFileSync(file, "utf8")
    if (
      text.includes(
        'order.summary ? getStylizedAmount(order.summary.pending_difference || 0, order.currency_code) : "Not available"'
      )
    )
      continue
    // Only change the legacy Total component's unguarded summary dereference.
    const pattern =
      /getStylizedAmount\(\s*order\.summary\.pending_difference \|\| 0,\s*order\.currency_code\s*\)/g
    if ([...text.matchAll(pattern)].length !== 1)
      throw new Error(
        `Order summary patch no longer matches ${file}; review the dashboard upgrade`
      )
    fs.writeFileSync(
      file,
      text.replace(
        pattern,
        'order.summary ? getStylizedAmount(order.summary.pending_difference || 0, order.currency_code) : "Not available"'
      )
    )
  }
  console.log("[admin] Missing order summary fallback ready")
}
if (require.main === module) module.exports()
