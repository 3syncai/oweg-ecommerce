"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const customer_1 = __importDefault(require("@medusajs/customer/dist/models/customer"));
const utils_1 = require("@medusajs/framework/utils");
const customer_address_1 = __importDefault(require("./customer-address"));
const customer_group_1 = __importDefault(require("./customer-group"));
const customer_group_customer_1 = __importDefault(require("./customer-group-customer"));
const parsed = customer_1.default.parse();
const { created_at, updated_at, deleted_at, groups: _groups, addresses: _addresses, ...baseSchema } = parsed.schema;
const Customer = utils_1.model
    .define({
    name: parsed.name,
    tableName: parsed.tableName,
}, {
    ...baseSchema,
    customer_type: utils_1.model.enum(["individual", "business"]).default("individual"),
    gst_number: utils_1.model.text().nullable(),
    company_name: utils_1.model.text().searchable().nullable(),
    referral_code: utils_1.model.text().nullable(),
    first_name: utils_1.model.text().searchable(),
    last_name: utils_1.model.text().searchable(),
    email: utils_1.model.text().searchable(),
    phone: utils_1.model.text().searchable(),
    newsletter_subscribe: utils_1.model.boolean().default(false),
    groups: utils_1.model.manyToMany(() => customer_group_1.default, {
        mappedBy: "customers",
        pivotEntity: () => customer_group_customer_1.default,
    }),
    addresses: utils_1.model.hasMany(() => customer_address_1.default, {
        mappedBy: "customer",
    }),
})
    .cascades(parsed.cascades)
    .indexes([
    ...parsed.indexes,
    {
        on: ["phone"],
        unique: true,
        where: "deleted_at IS NULL",
    },
    {
        on: ["gst_number"],
        unique: true,
        where: "deleted_at IS NULL AND customer_type = 'business' AND gst_number IS NOT NULL",
    },
])
    .checks([
    ...(parsed.checks ?? []),
    {
        name: "customer_business_fields_check",
        expression: `
        customer_type = 'individual'
        OR (
          customer_type = 'business'
          AND company_name IS NOT NULL
          AND gst_number IS NOT NULL
        )
      `,
    },
]);
exports.default = Customer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9jdXN0b21lci9tb2RlbHMvY3VzdG9tZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSx1RkFBa0U7QUFDbEUscURBQWlEO0FBRWpELDBFQUFnRDtBQUNoRCxzRUFBNEM7QUFDNUMsd0ZBQTZEO0FBRTdELE1BQU0sTUFBTSxHQUFHLGtCQUFZLENBQUMsS0FBSyxFQUFFLENBQUE7QUFFbkMsTUFBTSxFQUNKLFVBQVUsRUFDVixVQUFVLEVBQ1YsVUFBVSxFQUNWLE1BQU0sRUFBRSxPQUFPLEVBQ2YsU0FBUyxFQUFFLFVBQVUsRUFDckIsR0FBRyxVQUFVLEVBQ2QsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFBO0FBRWpCLE1BQU0sUUFBUSxHQUFHLGFBQUs7S0FDbkIsTUFBTSxDQUNMO0lBQ0UsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO0lBQ2pCLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUztDQUM1QixFQUNEO0lBQ0UsR0FBRyxVQUFVO0lBQ2IsYUFBYSxFQUFFLGFBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDO0lBQzNFLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ25DLFlBQVksRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2xELGFBQWEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3RDLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFO0lBQ3JDLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFO0lBQ3BDLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFO0lBQ2hDLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFO0lBQ2hDLG9CQUFvQixFQUFFLGFBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQ3BELE1BQU0sRUFBRSxhQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLHdCQUFhLEVBQUU7UUFDNUMsUUFBUSxFQUFFLFdBQVc7UUFDckIsV0FBVyxFQUFFLEdBQUcsRUFBRSxDQUFDLGlDQUFxQjtLQUN6QyxDQUFDO0lBQ0YsU0FBUyxFQUFFLGFBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsMEJBQWUsRUFBRTtRQUM5QyxRQUFRLEVBQUUsVUFBVTtLQUNyQixDQUFDO0NBQ0gsQ0FDRjtLQUNBLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBZSxDQUFDO0tBQ2hDLE9BQU8sQ0FBQztJQUNQLEdBQUcsTUFBTSxDQUFDLE9BQU87SUFDakI7UUFDRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUM7UUFDYixNQUFNLEVBQUUsSUFBSTtRQUNaLEtBQUssRUFBRSxvQkFBb0I7S0FDNUI7SUFDRDtRQUNFLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQztRQUNsQixNQUFNLEVBQUUsSUFBSTtRQUNaLEtBQUssRUFDSCw4RUFBOEU7S0FDakY7Q0FDRixDQUFDO0tBQ0QsTUFBTSxDQUFDO0lBQ04sR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDO0lBQ3hCO1FBQ0UsSUFBSSxFQUFFLGdDQUFnQztRQUN0QyxVQUFVLEVBQUU7Ozs7Ozs7T0FPWDtLQUNGO0NBQ0YsQ0FBQyxDQUFBO0FBRUosa0JBQWUsUUFBUSxDQUFBIn0=