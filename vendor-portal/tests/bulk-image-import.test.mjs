import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load("node:test"), assert = load("node:assert/strict")
const fs = load("node:fs"), ts = load("typescript")
load.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { isRemoteImageSource } = load("../lib/bulk-image-source.ts")
const { normalizeImageKey, isMediaUrl } = load("../lib/bulk-upload.ts")
const { importBulkImageSources } = load("../lib/bulk-image-import.ts")

test("HTTP and HTTPS images preserve case-sensitive paths and signed queries; filenames retain matching", () => {
  for (const protocol of ["http", "https"]) {
    const url = `${protocol}://cdn.example.com/Photo-A.JPG?Signature=AbC123`
    assert.ok(isRemoteImageSource(url))
    assert.equal(normalizeImageKey(` ${url} `), url)
  }
  assert.equal(normalizeImageKey(" Photo.JPG "), "photo.jpg")
  assert.equal(isMediaUrl("http://cdn.example.com/video.mp4"), false, "video/published media policy is still HTTPS")
  for (const input of ["ftp://example.com/a.jpg", "https://user:pass@example.com/a.jpg", "photo.jpg"]) assert.equal(isRemoteImageSource(input), false)
})

test("large sheets deduplicate references and check only three images concurrently", async () => {
  const urls = Array.from({ length: 2997 }, (_, i) => `http://cdn.example.com/${i}.JPG`)
  let active = 0, peak = 0, calls = 0
  const states = new Map()
  const result = await importBulkImageSources([...urls, urls[0], "local.jpg"], async url => {
    calls++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve)); active--
    return { url: url.replace("http:", "https:") }
  }, (key, state) => states.set(key, state))
  assert.equal(calls, 2997); assert.equal(peak, 3)
  assert.deepEqual(result, { ready: 2997, failed: 0 })
  assert.ok([...states.values()].every(state => state.status === "uploaded" && state.url.startsWith("https:")))
})

test("broken image keeps its exact reference and error; other images finish", async () => {
  const states = new Map()
  const result = await importBulkImageSources(["http://example.com/broken.jpg", "https://example.com/good.jpg"], async url => {
    if (url.includes("broken")) throw new Error("Image source returned HTTP 404")
    return { url }
  }, (key, state) => states.set(key, state))
  assert.deepEqual(result, { ready: 1, failed: 1 })
  assert.match(states.get("http://example.com/broken.jpg").message, /404/)
})

test("HTTP output cannot be marked ready and cancelled imports stop updating the sheet", async () => {
  const states = new Map(), controller = new AbortController()
  const first = await importBulkImageSources(["http://example.com/a.jpg"], async url => ({ url }), (key, state) => states.set(key, state))
  assert.equal(first.failed, 1)
  controller.abort()
  let calls = 0
  await importBulkImageSources(["http://example.com/a.jpg"], async () => { calls++; return { url: "https://example.com/a.jpg" } }, () => assert.fail("cancelled update"), controller.signal)
  assert.equal(calls, 0)
})
