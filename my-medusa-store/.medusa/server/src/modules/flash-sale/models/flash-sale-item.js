"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const FlashSaleItem = utils_1.model.define("flash_sale_item", {
    id: utils_1.model.id().primaryKey(),
    // Product ID
    product_id: utils_1.model.text(),
    // Variant ID (for the variant we're modifying)
    variant_id: utils_1.model.text(),
    // Flash sale price (amount in rupees)
    flash_sale_price: utils_1.model.number(),
    // Original price (amount in rupees) - stored for restoration
    original_price: utils_1.model.number(),
    // Original price_id (for restoring the price_set)
    original_price_id: utils_1.model.text().nullable(),
    // Timer - when the flash sale expires
    expires_at: utils_1.model.dateTime(),
});
exports.default = FlashSaleItem;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxhc2gtc2FsZS1pdGVtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL21vZHVsZXMvZmxhc2gtc2FsZS9tb2RlbHMvZmxhc2gtc2FsZS1pdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQWlEO0FBRWpELE1BQU0sYUFBYSxHQUFHLGFBQUssQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUU7SUFDcEQsRUFBRSxFQUFFLGFBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLEVBQUU7SUFFM0IsYUFBYTtJQUNiLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBRXhCLCtDQUErQztJQUMvQyxVQUFVLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRTtJQUV4QixzQ0FBc0M7SUFDdEMsZ0JBQWdCLEVBQUUsYUFBSyxDQUFDLE1BQU0sRUFBRTtJQUVoQyw2REFBNkQ7SUFDN0QsY0FBYyxFQUFFLGFBQUssQ0FBQyxNQUFNLEVBQUU7SUFFOUIsa0RBQWtEO0lBQ2xELGlCQUFpQixFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFMUMsc0NBQXNDO0lBQ3RDLFVBQVUsRUFBRSxhQUFLLENBQUMsUUFBUSxFQUFFO0NBQzdCLENBQUMsQ0FBQTtBQUVGLGtCQUFlLGFBQWEsQ0FBQSJ9