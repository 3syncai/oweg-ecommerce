const fs = require('node:fs')
const path = require('node:path')
const { buildSync } = require('esbuild')

// Guard the existing dashboard flow rather than replacing its media editor.
function patchMediaSource(source, format = 'source') {
  if (!source.includes('owegUploadResultsComplete')) {
    const anchor = /uploaded = uploads;?/g
    if ([...source.matchAll(anchor)].length !== 1) throw new Error('Product media upload patch no longer matches; review dashboard upgrade')
    source = source.replace(anchor, `uploaded = uploads;
      const owegUploadResultsComplete = Array.isArray(uploaded)
        && uploaded.length === filesToUpload.length
        && uploaded.every((file) => typeof file?.url === "string" && /^https?:\\/\\//i.test(file.url));
      if (!owegUploadResultsComplete) {
        form.setError("media", { type: "invalid_file", message: "Images could not be uploaded. Your saved product images have not been changed. Please try again." });
        return;
      }`)
  }
  if (source.includes('owegConfirmEmptyMedia')) return source
  const submitStart = source.indexOf('const handleSubmit = form.handleSubmit(async ({ media }) => {')
  const dragStart = source.lastIndexOf('const handleDragStart =', submitStart)
  if (submitStart < 0 || dragStart < 0) throw new Error('Product media thumbnail patch no longer matches')
  source = source.slice(0, dragStart) + 'const owegConfirmEmptyMedia = useOwegMediaThumbnail(fields, update);\n  ' + source.slice(dragStart)
  source = source.replace('const handleSubmit = form.handleSubmit(async ({ media }) => {', `const handleSubmit = form.handleSubmit(async ({ media }) => {
    if (!media.length && (product.images?.length || product.thumbnail)) {
      const confirmed = await owegConfirmEmptyMedia({
        title: "Remove all product images?",
        description: "This product will have no images or thumbnail. Save this change?",
        confirmText: "Remove all images", cancelText: "Keep editing",
      });
      if (!confirmed) return;
    }`)
  const thumbnail = 'const thumbnail = withUpdatedUrls.find((m) => m.isThumbnail)?.url'
  if (source.split(thumbnail).length !== 2) throw new Error('Product media thumbnail save no longer matches')
  source = source.replace(thumbnail, thumbnail + ' || withUpdatedUrls[0]?.url')
  if (format === 'source') {
    source = source.replaceAll('<ThumbnailBadge />', '<OwegMediaThumbnailBadge />')
    source += '\nimport { useOwegMediaThumbnail, OwegMediaThumbnailBadge } from "../../../../../oweg-product-media-thumbnail"\n'
  } else if (format === 'esm') {
    source = source.replaceAll('jsx(ThumbnailBadge, {})', 'jsx(OwegMediaThumbnailBadge, {})')
    source += '\nimport { useOwegMediaThumbnail, OwegMediaThumbnailBadge } from "./oweg-product-media-thumbnail.mjs";\n'
  } else {
    // Match only the media editor's icon binding; other dashboard badges stay unchanged.
    const segment = source.slice(source.indexOf('const owegConfirmEmptyMedia'), source.indexOf('const owegConfirmEmptyMedia') + 25000)
    const icon = segment.match(/\(0, (import_jsx_runtime\d+)\.jsx\)\((import_icons\d+)\.ThumbnailBadge, \{\}\)/)
    if (!icon) throw new Error('Product media badge binding not found')
    source = source.replaceAll(`(0, ${icon[1]}.jsx)(${icon[2]}.ThumbnailBadge, {})`, `(0, ${icon[1]}.jsx)(OwegMediaThumbnailBadge, {})`)
    source += '\nvar { useOwegMediaThumbnail, OwegMediaThumbnailBadge } = require("./oweg-product-media-thumbnail.cjs");\n'
  }
  return source
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
  const edits = files.map((file, index) => [file, patchMediaSource(fs.readFileSync(file, 'utf8'), ['esm', 'cjs', 'source'][index])])
  const root = path.resolve(__dirname, '..')
  for (const [format, output] of [['esm', 'dist/oweg-product-media-thumbnail.mjs'], ['cjs', 'dist/oweg-product-media-thumbnail.cjs'], ['esm', 'src/oweg-product-media-thumbnail.js']]) {
    buildSync({ absWorkingDir: root, entryPoints: ['src/admin/components/product-media-thumbnail.tsx'],
      outfile: path.join(dashboard, output), bundle: true, packages: 'external', format,
      platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'silent' })
  }
  for (const [file, text] of edits) fs.writeFileSync(file, text)
  console.log('[admin] Product media upload guard and automatic thumbnail ready')
}
module.exports = { apply, patchMediaSource }
if (require.main === module) apply()
