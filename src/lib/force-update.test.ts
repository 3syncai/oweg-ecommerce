import assert from "node:assert/strict";
import { test } from "node:test";

/** Mirrors isVersionBelow in force-update.ts (kept local so Node can test without path aliases). */
function isVersionBelow(current: string, minimum: string): boolean {
  if (!current || !minimum) return false;
  const parse = (value: string) =>
    value
      .split(/[.+-]/)
      .filter(Boolean)
      .map((part) => Number.parseInt(part.replace(/\D/g, ""), 10) || 0);
  const a = parse(current);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left < right) return true;
    if (left > right) return false;
  }
  return false;
}

test("isVersionBelow compares dotted versions", () => {
  assert.equal(isVersionBelow("1.0.0", "1.0.1"), true);
  assert.equal(isVersionBelow("1.0.1", "1.0.0"), false);
  assert.equal(isVersionBelow("1.0.0", "1.0.0"), false);
  assert.equal(isVersionBelow("0.9.9", "1.0.0"), true);
  assert.equal(isVersionBelow("2.0", "2.0.1"), true);
});
