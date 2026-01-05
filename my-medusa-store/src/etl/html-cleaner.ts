// src/etl/html-cleaner.ts
// HTML description cleaning utilities for ETL

import { decode } from "he";
import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "ul", "ol", "li", "br", "strong", "em", "b", "i", "h2", "h3"];
const allowedAttributes = { a: ["href", "title", "target", "rel"] };

/**
 * Decode HTML entities multiple times (handles double/triple encoding)
 */
export function decodeMulti(s: string): string {
  if (!s) return "";
  let prev = s;
  let next = decode(prev);
  let i = 0;
  while (next !== prev && i < 2) {
    prev = next;
    next = decode(prev);
    i++;
  }
  return prev;
}

/**
 * Clean HTML description: decode entities, remove inline styles/classes, sanitize
 */
export function cleanHtml(raw: string): string {
  if (!raw) return "";
  
  const decoded = decodeMulti(raw)
    .replace(/ style="[^"]*"/gi, "")
    .replace(/ class="[^"]*"/gi, "")
    .replace(/<\/?span[^>]*>/gi, "");
  
  return sanitizeHtml(decoded, { allowedTags, allowedAttributes }).trim();
}

