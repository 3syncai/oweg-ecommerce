"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const customer_1 = __importDefault(require("./customer"));
const customer_group_customer_1 = __importDefault(require("./customer-group-customer"));
const CustomerGroup = utils_1.model
    .define("CustomerGroup", {
    id: utils_1.model.id({ prefix: "cusgroup" }).primaryKey(),
    name: utils_1.model.text().searchable(),
    metadata: utils_1.model.json().nullable(),
    created_by: utils_1.model.text().nullable(),
    customers: utils_1.model.manyToMany(() => customer_1.default, {
        mappedBy: "groups",
        pivotEntity: () => customer_group_customer_1.default,
    }),
})
    .indexes([
    {
        on: ["name"],
        unique: true,
        where: "deleted_at IS NULL",
    },
])
    .cascades({
    detach: ["customers"],
});
exports.default = CustomerGroup;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tZXItZ3JvdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9jdXN0b21lci9tb2RlbHMvY3VzdG9tZXItZ3JvdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxREFBaUQ7QUFFakQsMERBQWlDO0FBQ2pDLHdGQUE2RDtBQUU3RCxNQUFNLGFBQWEsR0FBRyxhQUFLO0tBQ3hCLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDdkIsRUFBRSxFQUFFLGFBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUU7SUFDakQsSUFBSSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUU7SUFDL0IsUUFBUSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDakMsVUFBVSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDbkMsU0FBUyxFQUFFLGFBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsa0JBQVEsRUFBRTtRQUMxQyxRQUFRLEVBQUUsUUFBUTtRQUNsQixXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsaUNBQXFCO0tBQ3pDLENBQUM7Q0FDSCxDQUFDO0tBQ0QsT0FBTyxDQUFDO0lBQ1A7UUFDRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUM7UUFDWixNQUFNLEVBQUUsSUFBSTtRQUNaLEtBQUssRUFBRSxvQkFBb0I7S0FDNUI7Q0FDRixDQUFDO0tBQ0QsUUFBUSxDQUFDO0lBQ1IsTUFBTSxFQUFFLENBQUMsV0FBVyxDQUFDO0NBQ3RCLENBQUMsQ0FBQTtBQUVKLGtCQUFlLGFBQWEsQ0FBQSJ9