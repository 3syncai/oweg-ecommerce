"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const AffiliateCommission = utils_1.model.define("affiliate_commission", {
    id: utils_1.model.id().primaryKey(),
    // Commission can be set for product, category, collection, or type
    product_id: utils_1.model.text().nullable(),
    category_id: utils_1.model.text().nullable(),
    collection_id: utils_1.model.text().nullable(),
    type_id: utils_1.model.text().nullable(),
    // Commission rate as percentage (e.g., 5 for 5%)
    commission_rate: utils_1.model.number(),
    // Metadata for additional info
    metadata: utils_1.model.json().nullable(),
});
exports.default = AffiliateCommission;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWZmaWxpYXRlLWNvbW1pc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbW9kZWxzL2FmZmlsaWF0ZS1jb21taXNzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQWlEO0FBRWpELE1BQU0sbUJBQW1CLEdBQUcsYUFBSyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRTtJQUMvRCxFQUFFLEVBQUUsYUFBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsRUFBRTtJQUUzQixtRUFBbUU7SUFDbkUsVUFBVSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDbkMsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsYUFBYSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDdEMsT0FBTyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFaEMsaURBQWlEO0lBQ2pELGVBQWUsRUFBRSxhQUFLLENBQUMsTUFBTSxFQUFFO0lBRS9CLCtCQUErQjtJQUMvQixRQUFRLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtDQUNsQyxDQUFDLENBQUE7QUFFRixrQkFBZSxtQkFBbUIsQ0FBQSJ9