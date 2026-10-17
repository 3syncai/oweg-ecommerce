import { test } from "node:test";
import assert from "node:assert/strict";
import { returnRequestError } from "./return-request-error.ts";

test("return errors show useful text rather than raw Medusa JSON or server details", () => {
  assert.equal(returnRequestError(400, { message: "Return window has expired." }), "Return window has expired.");
  assert.ok(!returnRequestError(500, { message: "database password=secret" }).includes("secret"));
  assert.ok(!returnRequestError(400, { error: '{"code":"unknown_error"}' }).includes("unknown_error"));
  assert.ok(returnRequestError(401, null).includes("sign in"));
});
