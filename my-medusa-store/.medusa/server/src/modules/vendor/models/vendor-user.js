"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const VendorUser = utils_1.model.define("vendor_user", {
    id: utils_1.model.id().primaryKey(),
    email: utils_1.model.text().unique(),
    password_hash: utils_1.model.text(),
    last_login_at: utils_1.model.dateTime().nullable(),
    must_reset_password: utils_1.model.boolean().default(false),
    metadata: utils_1.model.json().nullable(),
    vendor_id: utils_1.model.text().nullable(),
});
exports.default = VendorUser;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVuZG9yLXVzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbW9kZWxzL3ZlbmRvci11c2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQWlEO0FBRWpELE1BQU0sVUFBVSxHQUFHLGFBQUssQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0lBQzdDLEVBQUUsRUFBRSxhQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFO0lBRTNCLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFO0lBQzVCLGFBQWEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBQzNCLGFBQWEsRUFBRSxhQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQzFDLG1CQUFtQixFQUFFLGFBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQ25ELFFBQVEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBRWpDLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQ25DLENBQUMsQ0FBQTtBQUVGLGtCQUFlLFVBQVUsQ0FBQSJ9