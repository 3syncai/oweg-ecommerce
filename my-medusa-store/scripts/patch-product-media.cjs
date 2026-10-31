const fs = require('node:fs')
const path = require('node:path')

// Guard the existing dashboard flow rather than replacing its media editor.
function patchMediaSource(source) {
  if (source.includes('owegUploadResultsComplete')) return source
  const anchor = /uploaded = uploads;?/g
  if ([...source.matchAll(anchor)].length !== 1) throw new Error('Product media upload patch no longer matches; review dashboard upgrade')
  return source.replace(anchor, `uploaded = uploads;
      const owegUploadResultsComplete = Array.isArray(uploaded)
        && uploaded.length === filesToUpload.length
        && uploaded.every((file) => typeof file?.url === "string" && /^https?:\\/\\//i.test(file.url));
      if (!owegUploadResultsComplete) {
        form.setError("media", { type: "invalid_file", message: "Images could not be uploaded. Your saved product images have not been changed. Please try again." });
        return;
      }`)
}

function apply() {
  const dashboard = path.resolve(__dirname, '../node_modules/@medusajs/dashboard')
  if (!fs.existsSync(dashboard)) return
  const dist = path.join(dashboard, 'dist')
  const chunk = fs.readdirSync(dist).find(name => /^product-media-.*\.mjs$/.test(name))
  if (!chunk) throw new Error('Product media dashboard bundle not found')
  const files = [path.join(dist, chunk), path.join(dist, 'app.js'),
    path.join(dashboard, 'src/routes/products/product-media/components/edit-product-media-form/edit-product-media-form.tsx')]
  // Validate all targets before writing any of them.
  const edits = files.map(file => [file, patchMediaSource(fs.readFileSync(file, 'utf8'))])
  for (const [file, text] of edits) fs.writeFileSync(file, text)
  console.log('[admin] Product media upload failure guard ready')
}
module.exports = { apply, patchMediaSource }
if (require.main === module) apply()
