import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContentSecurityPolicy, getAllowedImageHosts } from "./security-headers.ts";

const marketingHost = "oweg-s3-408760997836-ap-south-1-an.s3.ap-south-1.amazonaws.com";

test("production permits the current marketing bucket without storefront S3 env", () => {
  const names = ["NODE_ENV", "S3_BUCKET", "S3_REGION", "S3_FILE_URL", "NEXT_PUBLIC_S3_FILE_URL"];
  const saved = names.map((name) => process.env[name]);
  try {
    names.forEach((name) => delete process.env[name]);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.ok(getAllowedImageHosts().includes(marketingHost));
    const directives = buildContentSecurityPolicy().split("; ");
    for (const name of ["img-src", "connect-src"]) {
      const directive = directives.find((value) => value.startsWith(`${name} `));
      assert.ok(directive?.split(" ").includes(`https://${marketingHost}`));
      assert.ok(!directive?.split(" ").includes("https://*.amazonaws.com"));
    }
  } finally {
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});

test("new configured buckets still join the exact-host allowlist", () => {
  const savedBucket = process.env.S3_BUCKET;
  const savedRegion = process.env.S3_REGION;
  try {
    process.env.S3_BUCKET = "future-storefront-media";
    process.env.S3_REGION = "ap-south-1";
    assert.ok(getAllowedImageHosts().includes("future-storefront-media.s3.ap-south-1.amazonaws.com"));
  } finally {
    if (savedBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = savedBucket;
    if (savedRegion === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = savedRegion;
  }
});
