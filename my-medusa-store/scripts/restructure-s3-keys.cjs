// Node >= 18 (uses global fetch). Save as: scripts/restructure-s3-keys.cjs
// Run first as a dry run, then for real (see Step 2).

require("dotenv").config();
const AWS = require("aws-sdk");
const path = require("path");

// ===== ENV =====
const BUCKET = process.env.OBJECT_STORAGE_BUCKET;
const FILE_BASE_URL = process.env.FILE_BASE_URL; // e.g. https://<bucket>.s3.ap-south-1.amazonaws.com
const PREFIX_ROOT = process.env.OBJECT_STORAGE_PREFIX || "opencart";

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_BASIC = process.env.MEDUSA_ADMIN_BASIC; // Authorization: Basic <SECRET>
const ADMIN_TOKEN = process.env.MEDUSA_ADMIN_TOKEN; // x-medusa-access-token: <SECRET>

const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false"; // default true
const KEEP_OLD = (process.env.KEEP_OLD ?? "true").toLowerCase() !== "false"; // default true

// ===== AWS S3 =====
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "ap-south-1",
});
const s3 = new AWS.S3();

// ===== Helpers =====
const slug = (s) =>
  (s || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "generic";

const adminHeaders = () => {
  if (ADMIN_BASIC)
    return {
      Authorization: `Basic ${ADMIN_BASIC}`,
      "Content-Type": "application/json",
    };
  if (ADMIN_TOKEN)
    return {
      "x-medusa-access-token": ADMIN_TOKEN,
      "Content-Type": "application/json",
    };
  throw new Error("No MEDUSA_ADMIN_BASIC or MEDUSA_ADMIN_TOKEN set.");
};

const listMedusaProducts = async () => {
  const headers = adminHeaders();
  let offset = 0,
    limit = 100,
    out = [];
  for (;;) {
    const res = await fetch(
      `${MEDUSA_URL}/admin/products?limit=${limit}&offset=${offset}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Medusa list products failed: ${res.status}`);
    const json = await res.json();
    if (!json.products || json.products.length === 0) break;
    out = out.concat(json.products);
    if (json.products.length < limit) break;
    offset += limit;
  }
  return out;
};

const listOldKeysForOcId = async (ocId) => {
  // legacy keys like: opencart/oc_product_image_<productId>_<index>.jpg
  const prefix = `${PREFIX_ROOT}/oc_product_image_${ocId}_`;
  const keys = [];
  let ContinuationToken;
  do {
    const r = await s3
      .listObjectsV2({ Bucket: BUCKET, Prefix: prefix, ContinuationToken })
      .promise();
    (r.Contents || []).forEach((o) => keys.push(o.Key));
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
};

const copyKey = async (oldKey, newKey) => {
  if (oldKey === newKey) return true;
  const CopySource = encodeURI(`${BUCKET}/${oldKey}`);
  if (DRY_RUN) {
    console.log(`   • DRY RUN copy: ${oldKey}  →  ${newKey}`);
    return true;
  }
  await s3.copyObject({ Bucket: BUCKET, CopySource, Key: newKey }).promise();
  if (!KEEP_OLD) {
    await s3.deleteObject({ Bucket: BUCKET, Key: oldKey }).promise();
  }
  console.log(`   ✓ Copied: ${path.basename(oldKey)}  →  ${newKey}`);
  return true;
};

const updateMedusaImages = async (productId, urls) => {
  if (!urls.length) return;
  const headers = adminHeaders();
  const body = JSON.stringify({
    images: urls.map((u) => ({ url: u })),
    thumbnail: urls[0],
  });
  const res = await fetch(`${MEDUSA_URL}/admin/products/${productId}`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Medusa update failed (${res.status}): ${t.slice(0, 160)}`);
  }
};

(async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  S3 Key Restructure: legacy → brand/slug/id/images   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${DRY_RUN} | Keep old keys: ${KEEP_OLD}\n`);

  const products = await listMedusaProducts();

  let total = 0,
    moved = 0,
    skipped = 0,
    updated = 0;
  for (const p of products) {
    const ocId = String(
      p?.metadata?.opencart_id || p?.metadata?.oc_product_id || ""
    );
    if (!ocId) continue;

    const oldKeys = await listOldKeysForOcId(ocId);
    if (oldKeys.length === 0) {
      skipped++;
      continue;
    }

    total++;
    const brand = slug(
      p?.metadata?.brand ||
        p?.metadata?.manufacturer ||
        p?.metadata?.manufacturer_name ||
        "generic"
    );
    const prodSlug = slug(p?.handle || p?.title || `product-${ocId}`);
    const newPrefix = `${PREFIX_ROOT}/products/${brand}/${prodSlug}-${ocId}/images/`;

    console.log(`\n[#${total}] ${p.title}  (OC ${ocId})`);
    console.log(`   Old files: ${oldKeys.length}`);
    const newUrls = [];

    for (const k of oldKeys) {
      const base = path.basename(k); // keep original file name
      const newKey = `${newPrefix}${base}`;
      await copyKey(k, newKey);
      newUrls.push(`${FILE_BASE_URL}/${newKey}`);
      moved++;
    }

    try {
      await updateMedusaImages(p.id, newUrls);
      updated++;
      console.log(`   🎯 Medusa updated with ${newUrls.length} image(s).`);
    } catch (e) {
      console.warn(`   ⚠ Medusa update error: ${e.message}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  Products considered: ${products.length}`);
  console.log(`  With legacy images : ${total}`);
  console.log(`  Keys copied        : ${moved}`);
  console.log(`  Medusa updated     : ${updated}`);
  console.log(`  Skipped (no images): ${skipped}\n`);
})().catch((e) => {
  console.error("\n❌ Migration failed:", e);
  process.exit(1);
});
