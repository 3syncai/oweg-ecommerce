"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const AffiliateUser = utils_1.model.define("affiliate_user", {
    id: utils_1.model.id().primaryKey(),
    // Personal Information
    first_name: utils_1.model.text(),
    last_name: utils_1.model.text(),
    email: utils_1.model.text().unique(),
    password_hash: utils_1.model.text(),
    phone: utils_1.model.text().nullable(),
    refer_code: utils_1.model.text().nullable(),
    entry_sponsor: utils_1.model.text().nullable(),
    is_agent: utils_1.model.boolean().default(false),
    // Other Information
    gender: utils_1.model.text().nullable(),
    father_name: utils_1.model.text().nullable(),
    mother_name: utils_1.model.text().nullable(),
    birth_date: utils_1.model.dateTime().nullable(),
    qualification: utils_1.model.text().nullable(),
    marital_status: utils_1.model.text().nullable(),
    blood_group: utils_1.model.text().nullable(),
    emergency_person_name: utils_1.model.text().nullable(),
    emergency_person_mobile: utils_1.model.text().nullable(),
    aadhar_card_no: utils_1.model.text().nullable(),
    pan_card_no: utils_1.model.text().nullable(),
    aadhar_card_photo: utils_1.model.text().nullable(), // S3 URL
    pan_card_photo: utils_1.model.text().nullable(), // S3 URL
    // Work Information
    designation: utils_1.model.text().nullable(),
    sales_target: utils_1.model.text().nullable(),
    branch: utils_1.model.text().nullable(),
    area: utils_1.model.text().nullable(),
    state: utils_1.model.text().nullable(),
    // Payment Information
    payment_method: utils_1.model.text().nullable(),
    bank_name: utils_1.model.text().nullable(),
    bank_branch: utils_1.model.text().nullable(),
    ifsc_code: utils_1.model.text().nullable(),
    account_name: utils_1.model.text().nullable(),
    account_number: utils_1.model.text().nullable(),
    // Address
    address_1: utils_1.model.text().nullable(),
    address_2: utils_1.model.text().nullable(),
    city: utils_1.model.text().nullable(),
    pin_code: utils_1.model.text().nullable(),
    country: utils_1.model.text().nullable(),
    address_state: utils_1.model.text().nullable(),
    // Approval Status
    is_approved: utils_1.model.boolean().default(false),
    approved_at: utils_1.model.dateTime().nullable(),
    approved_by: utils_1.model.text().nullable(),
    rejected_at: utils_1.model.dateTime().nullable(),
    rejected_by: utils_1.model.text().nullable(),
    rejection_reason: utils_1.model.text().nullable(),
    // Login tracking
    last_login_at: utils_1.model.dateTime().nullable(),
    login_ip: utils_1.model.text().nullable(),
    metadata: utils_1.model.json().nullable(),
});
exports.default = AffiliateUser;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWZmaWxpYXRlLXVzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbW9kZWxzL2FmZmlsaWF0ZS11c2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQWlEO0FBRWpELE1BQU0sYUFBYSxHQUFHLGFBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7SUFDbkQsRUFBRSxFQUFFLGFBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLEVBQUU7SUFFM0IsdUJBQXVCO0lBQ3ZCLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBQ3hCLFNBQVMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBQ3ZCLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFO0lBQzVCLGFBQWEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFO0lBQzNCLEtBQUssRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQzlCLFVBQVUsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ25DLGFBQWEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3RDLFFBQVEsRUFBRSxhQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUV4QyxvQkFBb0I7SUFDcEIsTUFBTSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDL0IsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsVUFBVSxFQUFFLGFBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDdkMsYUFBYSxFQUFFLGFBQUss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