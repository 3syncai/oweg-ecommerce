"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreGetCustomerAddressesParams = exports.StoreUpdateCustomerAddress = exports.StoreCreateCustomerAddress = exports.StoreGetCustomerAddressParams = exports.StoreUpdateCustomer = exports.StoreGetCustomerParams = exports.StoreCreateCustomer = void 0;
const zod_1 = require("zod");
const validators_1 = require("@medusajs/medusa/dist/api/store/customers/validators");
Object.defineProperty(exports, "StoreCreateCustomerAddress", { enumerable: true, get: function () { return validators_1.StoreCreateCustomerAddress; } });
Object.defineProperty(exports, "StoreGetCustomerAddressesParams", { enumerable: true, get: function () { return validators_1.StoreGetCustomerAddressesParams; } });
Object.defineProperty(exports, "StoreGetCustomerAddressParams", { enumerable: true, get: function () { return validators_1.StoreGetCustomerAddressParams; } });
Object.defineProperty(exports, "StoreGetCustomerParams", { enumerable: true, get: function () { return validators_1.StoreGetCustomerParams; } });
Object.defineProperty(exports, "StoreUpdateCustomer", { enumerable: true, get: function () { return validators_1.StoreUpdateCustomer; } });
Object.defineProperty(exports, "StoreUpdateCustomerAddress", { enumerable: true, get: function () { return validators_1.StoreUpdateCustomerAddress; } });
exports.StoreCreateCustomer = zod_1.z
    .object({
    email: zod_1.z.string().email(),
    first_name: zod_1.z.string().min(1),
    last_name: zod_1.z.string().min(1),
    phone: zod_1.z.string().min(7),
    customer_type: zod_1.z.enum(["individual", "business"]),
    company_name: zod_1.z.string().optional(),
    gst_number: zod_1.z.string().max(32).optional(),
    referral_code: zod_1.z.string().optional().nullable(),
    newsletter_subscribe: zod_1.z.boolean().optional(),
})
    .superRefine((data, ctx) => {
    if (data.customer_type === "business") {
        if (!data.company_name || !data.company_name.trim()) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["company_name"],
                message: "Company name is required for business accounts",
            });
        }
        if (!data.gst_number || !data.gst_number.trim()) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["gst_number"],
                message: "GST number is required for business accounts",
            });
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9hcGkvc3RvcmUvY3VzdG9tZXJzL3ZhbGlkYXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkJBQXVCO0FBRXZCLHFGQU82RDtBQXFDM0QsMkdBM0NBLHVDQUEwQixPQTJDQTtBQUUxQixnSEE1Q0EsNENBQStCLE9BNENBO0FBSC9CLDhHQXhDQSwwQ0FBNkIsT0F3Q0E7QUFGN0IsdUdBckNBLG1DQUFzQixPQXFDQTtBQUN0QixvR0FyQ0EsZ0NBQW1CLE9BcUNBO0FBR25CLDJHQXZDQSx1Q0FBMEIsT0F1Q0E7QUFwQ2YsUUFBQSxtQkFBbUIsR0FBRyxPQUFDO0tBQ2pDLE1BQU0sQ0FBQztJQUNOLEtBQUssRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFO0lBQ3pCLFVBQVUsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM3QixTQUFTLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDNUIsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3hCLGFBQWEsRUFBRSxPQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2pELFlBQVksRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ25DLFVBQVUsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJQUN6QyxhQUFhLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMvQyxvQkFBb0IsRUFBRSxPQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQzdDLENBQUM7S0FDRCxXQUFXLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUU7SUFDekIsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ3BELEdBQUcsQ0FBQyxRQUFRLENBQUM7Z0JBQ1gsSUFBSSxFQUFFLE9BQUMsQ0FBQyxZQUFZLENBQUMsTUFBTTtnQkFDM0IsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO2dCQUN0QixPQUFPLEVBQUUsZ0RBQWdEO2FBQzFELENBQUMsQ0FBQTtRQUNKLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNoRCxHQUFHLENBQUMsUUFBUSxDQUFDO2dCQUNYLElBQUksRUFBRSxPQUFDLENBQUMsWUFBWSxDQUFDLE1BQU07Z0JBQzNCLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDcEIsT0FBTyxFQUFFLDhDQUE4QzthQUN4RCxDQUFDLENBQUE7UUFDSixDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFBIn0=