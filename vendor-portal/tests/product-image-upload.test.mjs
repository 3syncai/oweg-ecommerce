import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load("node:test")
const assert = load("node:assert/strict")
const fs = load("node:fs")
const ts = load("typescript")
load.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
const { productImageSelectionError, uploadProductImageFiles } = load("../lib/product-image-upload.ts")

test("file selection rejects non-images and oversized files before any upload", () => {
  assert.equal(productImageSelectionError([{ type: "image/png", size: 10 * 1024 * 1024 }]), null)
  assert.match(productImageSelectionError([{ type: "text/plain", size: 10 }]), /image files/)
  assert.match(productImageSelectionError([{ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }]), /10 MB/)
  assert.equal(productImageSelectionError([]), null)
})

test("multiple uploads stay bounded, preserve selection order and retain successes on partial failure", async () => {
  let active = 0, maxActive = 0
  const files = Array.from({ length: 7 }, (_, i) => ({ name: String(i) }))
  const { uploaded, errors } = await uploadProductImageFiles(files, async file => {
    active++; maxActive = Math.max(maxActive, active)
    try {
      await new Promise(resolve => setTimeout(resolve, file.name === "0" ? 15 : 1))
      if (file.name === "2") throw new Error("Storage unavailable")
      return { url: file.name }
    } finally { active-- }
  })
  assert.equal(maxActive, 2)
  assert.deepEqual(uploaded.map(image => image.url), ["0", "1", "3", "4", "5", "6"])
  assert.deepEqual(errors, ["Storage unavailable"])
})

test("sync failures and empty selections are handled without unhandled rejection", async () => {
  assert.deepEqual(await uploadProductImageFiles([], () => { throw Error("must not run") }), { uploaded: [], errors: [] })
  const result = await uploadProductImageFiles([{ name: "broken" }], () => { throw Error("Upload failed") })
  assert.deepEqual(result, { uploaded: [], errors: ["Upload failed"] })
})
