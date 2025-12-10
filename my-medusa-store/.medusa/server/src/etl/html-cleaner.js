"use strict";
// src/etl/html-cleaner.ts
// HTML description cleaning utilities for ETL
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeMulti = decodeMulti;
exports.cleanHtml = cleanHtml;
const he_1 = require("he");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const allowedTags = ["p", "ul", "ol", "li", "br", "strong", "em", "b", "i", "h2", "h3"];
const allowedAttributes = { a: ["href", "title", "target", "rel"] };
/**
 * Decode HTML entities multiple times (handles double/triple encoding)
 */
function decodeMulti(s) {
    if (!s)
        return "";
    let prev = s;
    let next = (0, he_1.decode)(prev);
    let i = 0;
    while (next !== prev && i < 2) {
        prev = next;
        next = (0, he_1.decode)(prev);
        i++;
    }
    return prev;
}
/**
 * Clean HTML description: decode entities, remove inline styles/classes, sanitize
 */
function cleanHtml(raw) {
    if (!raw)
        return "";
    const decoded = decodeMulti(raw)
        .replace(/ style="[^"]*"/gi, "")
        .replace(/ class="[^"]*"/gi, "")
        .replace(/<\/?span[^>]*>/gi, "");
    return (0, sanitize_html_1.default)(decoded, { allowedTags, allowedAttributes }).trim();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHRtbC1jbGVhbmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9odG1sLWNsZWFuZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLDBCQUEwQjtBQUMxQiw4Q0FBOEM7Ozs7O0FBVzlDLGtDQVdDO0FBS0QsOEJBU0M7QUFsQ0QsMkJBQTRCO0FBQzVCLGtFQUF5QztBQUV6QyxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN4RixNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUVwRTs7R0FFRztBQUNILFNBQWdCLFdBQVcsQ0FBQyxDQUFTO0lBQ25DLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFDbEIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxJQUFJLEdBQUcsSUFBQSxXQUFNLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsT0FBTyxJQUFJLEtBQUssSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM5QixJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ1osSUFBSSxHQUFHLElBQUEsV0FBTSxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BCLENBQUMsRUFBRSxDQUFDO0lBQ04sQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0IsU0FBUyxDQUFDLEdBQVc7SUFDbkMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUVwQixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDO1NBQzdCLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUM7U0FDL0IsT0FBTyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztTQUMvQixPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFbkMsT0FBTyxJQUFBLHVCQUFZLEVBQUMsT0FBTyxFQUFFLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUMxRSxDQUFDIn0=