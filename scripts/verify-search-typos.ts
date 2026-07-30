/**
 * Live typo-tolerant search checks against localhost storefront.
 * Requires: npm run dev on :3000
 *
 * Usage: npm run test:search-typos-live
 */

import { TYPO_CASES } from "../src/lib/typo-test-cases.ts"

const BASE = process.env.SEARCH_VERIFY_BASE || "http://localhost:3000"
const GARBAGE = "xyzqwerty"

/**
 * @param {string} q
 * @returns {Promise<{ count: number, ids: string[] }>}
 */
async function search(q: string) {
  const url = `${BASE}/api/search?q=${encodeURIComponent(q)}&limit=5&pageSize=5`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for q=${JSON.stringify(q)}`)
  }
  const data = await res.json()
  const products = Array.isArray(data?.products) ? data.products : []
  return {
    count: typeof data?.count === "number" ? data.count : products.length,
    ids: products.map((p: { id?: string }) => String(p.id || "")).filter(Boolean),
  }
}

function overlap(a: string[], b: string[]) {
  const setB = new Set(b)
  return a.filter((id) => setB.has(id)).length
}

async function main() {
  console.log(`Verifying ${TYPO_CASES.length} typo cases against ${BASE}\n`)

  type Row = {
    typo: string
    baseline: string
    typoCount: number
    baseCount: number
    overlap: number
    status: "PASS" | "FAIL" | "SKIP"
    note: string
  }

  const rows: Row[] = []
  let failed = 0
  let skipped = 0
  let passed = 0

  const baselineCache = new Map<string, Awaited<ReturnType<typeof search>>>()

  for (const { typo, baseline } of TYPO_CASES) {
    if (!baselineCache.has(baseline)) {
      baselineCache.set(baseline, await search(baseline))
    }
    const base = baselineCache.get(baseline)!
    const typoRes = await search(typo)
    const ov = overlap(typoRes.ids, base.ids)
    const hasTypoResults = typoRes.count > 0 && typoRes.ids.length > 0
    const baselineEmpty = base.count === 0 || base.ids.length === 0

    let status: Row["status"]
    let note: string

    if (baselineEmpty) {
      status = "SKIP"
      note = "baseline empty (catalog gap)"
      skipped += 1
    } else if (!hasTypoResults) {
      status = "FAIL"
      note = "baseline has hits; typo empty"
      failed += 1
    } else {
      status = "PASS"
      note = ov > 0 ? "ok" : "products but no top-5 overlap"
      passed += 1
    }

    rows.push({
      typo,
      baseline,
      typoCount: typoRes.count,
      baseCount: base.count,
      overlap: ov,
      status,
      note,
    })
  }

  const garbage = await search(GARBAGE)
  const garbagePass = garbage.count === 0 && garbage.ids.length === 0
  if (!garbagePass) failed += 1

  const pad = (s: string | number, n: number) => String(s).padEnd(n)
  console.log(
    [
      pad("STATUS", 8),
      pad("TYPO", 22),
      pad("BASELINE", 18),
      pad("TYPO#", 8),
      pad("BASE#", 8),
      pad("OVERLAP", 8),
      "NOTE",
    ].join(" ")
  )
  console.log("-".repeat(100))

  for (const r of rows) {
    console.log(
      [
        pad(r.status, 8),
        pad(r.typo, 22),
        pad(r.baseline, 18),
        pad(r.typoCount, 8),
        pad(r.baseCount, 8),
        pad(r.overlap, 8),
        r.note,
      ].join(" ")
    )
  }

  console.log("-".repeat(100))
  console.log(
    `${garbagePass ? "PASS" : "FAIL"}    garbage=${GARBAGE} count=${garbage.count} (expect 0)`
  )
  console.log(
    `\nPASS=${passed} SKIP=${skipped} FAIL=${failed - (garbagePass ? 0 : 1)} / ${rows.length}; garbage ${garbagePass ? "ok" : "FAILED"}`
  )

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
