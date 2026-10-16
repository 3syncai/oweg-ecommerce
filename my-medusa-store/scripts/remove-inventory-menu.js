/** Restore native Inventory; the superadmin page policy controls visibility. */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
module.exports = function restoreInventoryMenu() {
  const root = path.join(__dirname, '..', 'node_modules', '@medusajs', 'dashboard')
  for (const relative of ['dist/app.js', 'dist/chunk-HQKKXLCX.mjs', 'src/components/layout/main-layout/main-layout.tsx']) {
    const filename = path.join(root, relative)
    if (!fs.existsSync(filename)) continue
    const source = fs.readFileSync(filename, 'utf8')
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, relative.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const edits = []
    const destination = node => ts.isObjectLiteralExpression(node)
      ? node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(tree) === 'to' && ts.isStringLiteral(p.initializer))?.initializer.text
      : undefined
    function visit(node) {
      if (ts.isArrayLiteralExpression(node)) {
        const paths = node.elements.map(destination)
        if (['/orders', '/products', '/price-lists'].every(route => paths.includes(route))) {
          if (!paths.includes('/inventory')) {
            const product = node.elements.find(item => destination(item) === '/products')
            const inventory = product.getText(tree).replace('"/products"', '"/inventory"').replace('"products.domain"', '"inventory.domain"').replace(/\bTag\b/g, 'Buildings')
            edits.push([product.end, ',\n' + inventory])
          }
          return
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    let output = source
    for (const [position, text] of edits.sort((a,b) => b[0]-a[0])) output = output.slice(0,position) + text + output.slice(position)
    if (output !== source) {
      fs.writeFileSync(filename, output)
      console.log('[admin-ui] Restored Inventory menu in ' + relative)
    }
  }
}
if (require.main === module) module.exports()
