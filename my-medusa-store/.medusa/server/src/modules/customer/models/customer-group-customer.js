"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const customer_1 = __importDefault(require("./customer"));
const customer_group_1 = __importDefault(require("./customer-group"));
const CustomerGroupCustomer = utils_1.model.define("CustomerGroupCustomer", {
    id: utils_1.model.id({ prefix: "cusgc" }).primaryKey(),
    created_by: utils_1.model.text().nullable(),
    metadata: utils_1.model.json().nullable(),
    customer: utils_1.model.belongsTo(() => customer_1.default, {
        mappedBy: "groups",
    }),
    customer_group: utils_1.model.belongsTo(() => customer_group_1.default, {
        mappedBy: "customers",
    }),
});
exports.default = CustomerGroupCustomer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tZXItZ3JvdXAtY3VzdG9tZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9jdXN0b21lci9tb2RlbHMvY3VzdG9tZXItZ3JvdXAtY3VzdG9tZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxREFBaUQ7QUFFakQsMERBQWlDO0FBQ2pDLHNFQUE0QztBQUU1QyxNQUFNLHFCQUFxQixHQUFHLGFBQUssQ0FBQyxNQUFNLENBQUMsdUJBQXVCLEVBQUU7SUFDbEUsRUFBRSxFQUFFLGFBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUU7SUFDOUMsVUFBVSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDbkMsUUFBUSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDakMsUUFBUSxFQUFFLGFBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsa0JBQVEsRUFBRTtRQUN4QyxRQUFRLEVBQUUsUUFBUTtLQUNuQixDQUFDO0lBQ0YsY0FBYyxFQUFFLGFBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsd0JBQWEsRUFBRTtRQUNuRCxRQUFRLEVBQUUsV0FBVztLQUN0QixDQUFDO0NBQ0gsQ0FBQyxDQUFBO0FBRUYsa0JBQWUscUJBQXFCLENBQUEifQ==