"use strict";
// src/etl/s3-keys.ts
// Utility for building structured S3 object keys
Object.defineProperty(exports, "__esModule", { value: true });
exports.slug = slug;
exports.buildBrandProductImageKey = buildBrandProductImageKey;
exports.buildGenericImageKey = buildGenericImageKey;
/**
 * Slugify a string for use in S3 keys
 */
function slug(s) {
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
function buildBrandProductImageKey(params) {
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
function buildGenericImageKey(params) {
    const { sourceTable, sourceId, index, extension = "jpg" } = params;
    const prefix = process.env.OBJECT_STORAGE_PREFIX || "opencart";
    const base = `${slug(sourceTable)}_${sourceId}`;
    const indexSuffix = typeof index === "number" ? `_${index}` : "";
    return `${prefix}/${base}${indexSuffix}.${extension}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMta2V5cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9ldGwvczMta2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUJBQXFCO0FBQ3JCLGlEQUFpRDs7QUFLakQsb0JBT0M7QUFNRCw4REFzQkM7QUFNRCxvREFXQztBQXZERDs7R0FFRztBQUNILFNBQWdCLElBQUksQ0FBQyxDQUFTO0lBQzVCLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ2IsV0FBVyxFQUFFO1NBQ2IsSUFBSSxFQUFFO1NBQ04sT0FBTyxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUM7U0FDM0IsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7U0FDdkIsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN2QixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZ0IseUJBQXlCLENBQUMsTUFLekM7SUFDQyxNQUFNLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEdBQUcsTUFBTSxDQUFDO0lBRW5FLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLElBQUksZUFBZSxDQUFDLENBQUM7SUFDckQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRXRDLDJDQUEyQztJQUMzQyxNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLFNBQVMsU0FBUyxNQUFNLENBQUM7SUFDM0UsTUFBTSxRQUFRLEdBQUcsMEJBQTBCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDekQsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLFNBQVMsRUFBRSxDQUFDO0lBQ2hFLE1BQU0sWUFBWSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRWhELDJEQUEyRDtJQUMzRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixJQUFJLG1CQUFtQixDQUFDO0lBQ3hFLE9BQU8sR0FBRyxNQUFNLElBQUksU0FBUyxJQUFJLFdBQVcsSUFBSSxTQUFTLFdBQVcsWUFBWSxFQUFFLENBQUM7QUFDckYsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLG9CQUFvQixDQUFDLE1BS3BDO0lBQ0MsTUFBTSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFNBQVMsR0FBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLENBQUM7SUFDbkUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsSUFBSSxVQUFVLENBQUM7SUFDL0QsTUFBTSxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksUUFBUSxFQUFFLENBQUM7SUFDaEQsTUFBTSxXQUFXLEdBQUcsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDakUsT0FBTyxHQUFHLE1BQU0sSUFBSSxJQUFJLEdBQUcsV0FBVyxJQUFJLFNBQVMsRUFBRSxDQUFDO0FBQ3hELENBQUMifQ==