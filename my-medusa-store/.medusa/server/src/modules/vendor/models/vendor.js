"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const Vendor = utils_1.model.define("vendor", {
    id: utils_1.model.id().primaryKey(),
    // Personal Information
    name: utils_1.model.text(),
    first_name: utils_1.model.text().nullable(),
    last_name: utils_1.model.text().nullable(),
    email: utils_1.model.text().unique(),
    phone: utils_1.model.text().nullable(), // Personal phone
    telephone: utils_1.model.text().nullable(), // Alternative personal phone
    // Store Information
    store_name: utils_1.model.text().nullable(),
    store_phone: utils_1.model.text().nullable(),
    store_address: utils_1.model.text().nullable(),
    store_country: utils_1.model.text().nullable(),
    store_region: utils_1.model.text().nullable(),
    store_city: utils_1.model.text().nullable(),
    store_pincode: utils_1.model.text().nullable(),
    store_logo: utils_1.model.text().nullable(),
    store_banner: utils_1.model.text().nullable(),
    shipping_policy: utils_1.model.text().nullable(),
    return_policy: utils_1.model.text().nullable(),
    whatsapp_number: utils_1.model.text().nullable(),
    // Tax & Legal Information
    pan_gst: utils_1.model.text().nullable(), // Combined field (legacy)
    gst_no: utils_1.model.text().nullable(),
    pan_no: utils_1.model.text().nullable(),
    // Banking Information
    bank_name: utils_1.model.text().nullable(),
    account_no: utils_1.model.text().nullable(),
    ifsc_code: utils_1.model.text().nullable(),
    cancel_cheque_url: utils_1.model.text().nullable(),
    // Documents
    documents: utils_1.model.json().nullable(), // Array of VendorDocument
    // Approval Status
    is_approved: utils_1.model.boolean().default(false),
    approved_at: utils_1.model.dateTime().nullable(),
    approved_by: utils_1.model.text().nullable(),
    // Rejection Status
    rejection_reason: utils_1.model.text().nullable(),
    rejected_at: utils_1.model.dateTime().nullable(),
    rejected_by: utils_1.model.text().nullable(),
    // Integration
    marketplace_seller_id: utils_1.model.text().nullable(),
    metadata: utils_1.model.json().nullable(),
});
exports.default = Vendor; // ✅ Fix this - was "Vendors"
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVuZG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL21vZHVsZXMvdmVuZG9yL21vZGVscy92ZW5kb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBaUQ7QUFTakQsTUFBTSxNQUFNLEdBQUcsYUFBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUU7SUFDcEMsRUFBRSxFQUFFLGFBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLEVBQUU7SUFFM0IsdUJBQXVCO0lBQ3ZCLElBQUksRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBQ2xCLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ25DLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2xDLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFO0lBQzVCLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsaUJBQWlCO0lBQ2pELFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsNkJBQTZCO0lBRWpFLG9CQUFvQjtJQUNwQixVQUFVLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNuQyxXQUFXLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNwQyxhQUFhLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN0QyxhQUFhLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN0QyxZQUFZLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNyQyxVQUFVLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNuQyxhQUFhLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN0QyxVQUFVLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNuQyxZQUFZLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNyQyxlQUFlLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN4QyxhQUFhLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN0QyxlQUFlLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUV4QywwQkFBMEI7SUFDMUIsT0FBTyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSwwQkFBMEI7SUFDNUQsTUFBTSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDL0IsTUFBTSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFL0Isc0JBQXNCO0lBQ3RCLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2xDLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ25DLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2xDLGlCQUFpQixFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFMUMsWUFBWTtJQUNaLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsMEJBQTBCO0lBRTlELGtCQUFrQjtJQUNsQixXQUFXLEVBQUUsYUFBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFDM0MsV0FBVyxFQUFFLGFBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFcEMsbUJBQW1CO0lBQ25CLGdCQUFnQixFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDekMsV0FBVyxFQUFFLGFBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFcEMsY0FBYztJQUNkLHFCQUFxQixFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDOUMsUUFBUSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7Q0FDbEMsQ0FBQyxDQUFBO0FBRUYsa0JBQWUsTUFBTSxDQUFBLENBQUUsNkJBQTZCIn0=