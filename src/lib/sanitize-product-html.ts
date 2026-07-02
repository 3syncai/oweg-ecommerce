import DOMPurify from "isomorphic-dompurify";

/**
 * Aligns with Medusa ETL (`my-medusa-store/src/etl/html-cleaner.ts`) plus table
 * tags used in legacy product descriptions.
 */
const PRODUCT_HTML_ALLOWED_TAGS = [
  "p",
  "ul",
  "ol",
  "li",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "h2",
  "h3",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const PRODUCT_HTML_ALLOWED_ATTR = ["colspan", "rowspan"];

export function sanitizeProductHtml(html: string | null | undefined): string {
  if (!html) return "";

  const stripped = html
    .replace(/ style="[^"]*"/gi, "")
    .replace(/ class="[^"]*"/gi, "")
    .replace(/<\/?span[^>]*>/gi, "");

  return DOMPurify.sanitize(stripped.trim(), {
    ALLOWED_TAGS: PRODUCT_HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: PRODUCT_HTML_ALLOWED_ATTR,
  });
}
