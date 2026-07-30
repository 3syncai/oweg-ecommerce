import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collapseRepeatedLetters,
  rewriteSearchTypos,
} from "./search-query-normalize.ts"
import { TYPO_CASES } from "./typo-test-cases.ts"

describe("collapseRepeatedLetters", () => {
  it("collapses elongated runs to max 2", () => {
    assert.equal(collapseRepeatedLetters("faaaaan"), "faan")
    assert.equal(collapseRepeatedLetters("ceeeiling"), "ceeiling")
    assert.equal(collapseRepeatedLetters("mixxxer"), "mixxer")
  })

  it("leaves already-short runs alone", () => {
    assert.equal(collapseRepeatedLetters("fan"), "fan")
    assert.equal(collapseRepeatedLetters("faan"), "faan")
  })
})

describe("rewriteSearchTypos", () => {
  it(`covers ${TYPO_CASES.length} shared fixture cases`, () => {
    assert.ok(TYPO_CASES.length >= 50)
  })

  for (const { typo, expected } of TYPO_CASES) {
    it(`rewrites ${JSON.stringify(typo)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(rewriteSearchTypos(typo), expected)
    })
  }

  it("leaves ceiling fan unchanged", () => {
    assert.equal(rewriteSearchTypos("ceiling fan"), "ceiling fan")
  })
})
