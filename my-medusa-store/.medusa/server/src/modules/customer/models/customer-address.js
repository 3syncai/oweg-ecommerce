"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const customer_1 = __importDefault(require("./customer"));
const CustomerAddress = utils_1.model
    .define("CustomerAddress", {
    id: utils_1.model.id({ prefix: "cuaddr" }).primaryKey(),
    address_name: utils_1.model.text().searchable().nullable(),
    is_default_shipping: utils_1.model.boolean().default(false),
    is_default_billing: utils_1.model.boolean().default(false),
    company: utils_1.model.text().searchable().nullable(),
    first_name: utils_1.model.text().searchable().nullable(),
    last_name: utils_1.model.text().searchable().nullable(),
    address_1: utils_1.model.text().searchable().nullable(),
    address_2: utils_1.model.text().searchable().nullable(),
    city: utils_1.model.text().searchable().nullable(),
    country_code: utils_1.model.text().nullable(),
    province: utils_1.model.text().searchable().nullable(),
    postal_code: utils_1.model.text().searchable().nullable(),
    phone: utils_1.model.text().nullable(),
    metadata: utils_1.model.json().nullable(),
    customer: utils_1.model.belongsTo(() => customer_1.default, {
        mappedBy: "addresses",
    }),
})
    .indexes([
    {
        name: "IDX_customer_address_unique_customer_billing",
        on: ["customer_id"],
        unique: true,
        where: '"is_default_billing" = true',
    },
    {
        name: "IDX_customer_address_unique_customer_shipping",
        on: ["customer_id"],
        unique: true,
        where: '"is_default_shipping" = true',
    },
]);
exports.default = CustomerAddress;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tZXItYWRkcmVzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2N1c3RvbWVyL21vZGVscy9jdXN0b21lci1hZGRyZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEscURBQWlEO0FBRWpELDBEQUFpQztBQUVqQyxNQUFNLGVBQWUsR0FBRyxhQUFLO0tBQzFCLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRTtJQUN6QixFQUFFLEVBQUUsYUFBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRTtJQUMvQyxZQUFZLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNsRCxtQkFBbUIsRUFBRSxhQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUNuRCxrQkFBa0IsRUFBRSxhQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUNsRCxPQUFPLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUM3QyxVQUFVLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNoRCxTQUFTLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMvQyxTQUFTLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMvQyxTQUFTLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMvQyxJQUFJLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMxQyxZQUFZLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNyQyxRQUFRLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUM5QyxXQUFXLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNqRCxLQUFLLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUM5QixRQUFRLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNqQyxRQUFRLEVBQUUsYUFBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxrQkFBUSxFQUFFO1FBQ3hDLFFBQVEsRUFBRSxXQUFXO0tBQ3RCLENBQUM7Q0FDSCxDQUFDO0tBQ0QsT0FBTyxDQUFDO0lBQ1A7UUFDRSxJQUFJLEVBQUUsOENBQThDO1FBQ3BELEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQztRQUNuQixNQUFNLEVBQUUsSUFBSTtRQUNaLEtBQUssRUFBRSw2QkFBNkI7S0FDckM7SUFDRDtRQUNFLElBQUksRUFBRSwrQ0FBK0M7UUFDckQsRUFBRSxFQUFFLENBQUMsYUFBYSxDQUFDO1FBQ25CLE1BQU0sRUFBRSxJQUFJO1FBQ1osS0FBSyxFQUFFLDhCQUE4QjtLQUN0QztDQUNGLENBQUMsQ0FBQTtBQUVKLGtCQUFlLGVBQWUsQ0FBQSJ9