// src/etl/s3-keys.ts
// Utility for building structured S3 object keys

/**
 * Slugify a string for use in S3 keys
 */
export function slug(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

/**
 * Build a structured S3 key for product images
 * Format: opencart/products/<brand-slug>/<product-slug>-<ocId>/images/<image-name>
 */
export function buildBrandProductImageKey(params: {
  brandName?: string | null;
  productName: string;
  productId: number;
  originalName: string;
}): string {
  const { brandName, productName, productId, originalName } = params;

  const brandSlug = slug(brandName || "unknown-brand");
  const productSlug = slug(productName);

  // Extract filename from URL or use default
  const urlParts = originalName.split("/");
  const fileName = urlParts[urlParts.length - 1] || `image-${productId}.jpg`;
  const extMatch = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const baseName = fileName.split(".")[0] || `image-${productId}`;
  const safeFileName = `${slug(baseName)}.${ext}`;

  // Build key using forward slashes (never path.join for S3)
  const prefix = process.env.OBJECT_STORAGE_PREFIX || "opencart/products";
  return `${prefix}/${brandSlug}/${productSlug}-${productId}/images/${safeFileName}`;
}

/**
 * Build a generic S3 key (legacy format)
 * Format: opencart/<table>_<id>_<index>.<ext>
 */
export function buildGenericImageKey(params: {
  sourceTable: string;
  sourceId: string | number;
  index?: number;
  extension?: string;
}): string {
  const { sourceTable, sourceId, index, extension = "jpg" } = params;
  const prefix = process.env.OBJECT_STORAGE_PREFIX || "opencart";
  const base = `${slug(sourceTable)}_${sourceId}`;
  const indexSuffix = typeof index === "number" ? `_${index}` : "";
  return `${prefix}/${base}${indexSuffix}.${extension}`;
}
