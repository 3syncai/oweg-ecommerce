"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerModuleService = void 0;
const customer_module_1 = __importDefault(require("@medusajs/customer/dist/services/customer-module"));
const utils_1 = require("@medusajs/framework/utils");
const customer_1 = __importDefault(require("./models/customer"));
const customer_address_1 = __importDefault(require("./models/customer-address"));
const customer_group_1 = __importDefault(require("./models/customer-group"));
const customer_group_customer_1 = __importDefault(require("./models/customer-group-customer"));
const baseModelMap = customer_module_1.default[utils_1.MedusaServiceModelObjectsSymbol] ?? {};
class CustomerModuleService extends customer_module_1.default {
}
exports.CustomerModuleService = CustomerModuleService;
;
CustomerModuleService[utils_1.MedusaServiceModelObjectsSymbol] = {
    ...baseModelMap,
    CustomerAddress: customer_address_1.default,
    CustomerGroup: customer_group_1.default,
    CustomerGroupCustomer: customer_group_customer_1.default,
    Customer: customer_1.default,
};
exports.default = (0, utils_1.Module)(utils_1.Modules.CUSTOMER, {
    service: CustomerModuleService,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2N1c3RvbWVyL3NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsdUdBQXdGO0FBQ3hGLHFEQUlrQztBQUVsQyxpRUFBd0M7QUFDeEMsaUZBQXVEO0FBQ3ZELDZFQUFtRDtBQUNuRCwrRkFBb0U7QUFFcEUsTUFBTSxZQUFZLEdBQ2YseUJBR0MsQ0FBQyx1Q0FBK0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtBQUUzQyxNQUFNLHFCQUFzQixTQUFRLHlCQUF5QjtDQUFHO0FBYXZELHNEQUFxQjtBQVg5QixDQUFDO0FBQUMscUJBR0EsQ0FBQyx1Q0FBK0IsQ0FBQyxHQUFHO0lBQ3BDLEdBQUcsWUFBWTtJQUNmLGVBQWUsRUFBZiwwQkFBZTtJQUNmLGFBQWEsRUFBYix3QkFBYTtJQUNiLHFCQUFxQixFQUFyQixpQ0FBcUI7SUFDckIsUUFBUSxFQUFSLGtCQUFRO0NBQ1QsQ0FBQTtBQUlELGtCQUFlLElBQUEsY0FBTSxFQUFDLGVBQU8sQ0FBQyxRQUFRLEVBQUU7SUFDdEMsT0FBTyxFQUFFLHFCQUFxQjtDQUMvQixDQUFDLENBQUEifQ==