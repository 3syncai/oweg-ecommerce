"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const AffiliateAdmin = utils_1.model.define("affiliate_admin", {
    id: utils_1.model.id().primaryKey(),
    name: utils_1.model.text(),
    email: utils_1.model.text().unique(),
    password_hash: utils_1.model.text(),
    last_login_at: utils_1.model.dateTime().nullable(),
    login_ip: utils_1.model.text().nullable(),
});
exports.default = AffiliateAdmin;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWZmaWxpYXRlLWFkbWluLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL21vZHVsZXMvYWZmaWxpYXRlL21vZGVscy9hZmZpbGlhdGUtYWRtaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBaUQ7QUFFakQsTUFBTSxjQUFjLEdBQUcsYUFBSyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRTtJQUNyRCxFQUFFLEVBQUUsYUFBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsRUFBRTtJQUUzQixJQUFJLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRTtJQUNsQixLQUFLLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRTtJQUM1QixhQUFhLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRTtJQUMzQixhQUFhLEVBQUUsYUFBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMxQyxRQUFRLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtDQUNsQyxDQUFDLENBQUE7QUFFRixrQkFBZSxjQUFjLENBQUEifQ==