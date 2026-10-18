import assert from "node:assert/strict"
import { test } from "node:test"
import { hashReplacementConsentCode } from "../vendor-replacement-consent"

test("a customer consent code is bound to request, selected variant, and server key", () => {
  const key = "a-test-only-signing-key-with-sufficient-length"
  const digest = hashReplacementConsentCode("request-1", "variant-1", "01234567", key)
  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.notEqual(digest, hashReplacementConsentCode("request-2", "variant-1", "01234567", key))
  assert.notEqual(digest, hashReplacementConsentCode("request-1", "variant-2", "01234567", key))
  assert.notEqual(digest, hashReplacementConsentCode("request-1", "variant-1", "01234568", key))
  assert.notEqual(digest, hashReplacementConsentCode("request-1", "variant-1", "01234567", `${key}-different`))
})
