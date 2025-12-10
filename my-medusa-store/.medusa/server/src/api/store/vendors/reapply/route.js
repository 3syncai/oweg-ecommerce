"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const zod_1 = require("zod");
const vendor_1 = require("../../../../modules/vendor");
const ReapplySchema = zod_1.z.object({
    // Personal Information
    name: zod_1.z.string().min(1).optional(),
    firstName: zod_1.z.string().optional().nullable(),
    lastName: zod_1.z.string().optional().nullable(),
    phone: zod_1.z.string().optional().nullable(),
    telephone: zod_1.z.string().optional().nullable(),
    // Store Information
    store_name: zod_1.z.string().optional().nullable(),
    store_phone: zod_1.z.string().optional().nullable(),
    store_address: zod_1.z.string().optional().nullable(),
    store_country: zod_1.z.string().optional().nullable(),
    store_region: zod_1.z.string().optional().nullable(),
    store_city: zod_1.z.string().optional().nullable(),
    store_pincode: zod_1.z.string().optional().nullable(),
    store_logo: zod_1.z.string().optional().nullable(),
    store_banner: zod_1.z.string().optional().nullable(),
    shipping_policy: zod_1.z.string().optional().nullable(),
    return_policy: zod_1.z.string().optional().nullable(),
    whatsapp_number: zod_1.z.string().optional().nullable(),
    // Tax & Legal Information
    pan_gst: zod_1.z.string().optional().nullable(),
    gst_no: zod_1.z.string().optional().nullable(),
    pan_no: zod_1.z.string().optional().nullable(),
    // Banking Information
    bank_name: zod_1.z.string().optional().nullable(),
    account_no: zod_1.z.string().optional().nullable(),
    ifsc_code: zod_1.z.string().optional().nullable(),
    cancel_cheque_url: zod_1.z.string().optional().nullable(),
    // Documents
    documents: zod_1.z.array(zod_1.z.object({
        key: zod_1.z.string(),
        url: zod_1.z.string(),
        name: zod_1.z.string().optional(),
        type: zod_1.z.string().optional(),
    })).optional().nullable(),
});
// Get vendor ID from token
function getVendorIdFromRequest(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const parts = token.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
                if (payload.vendor_id) {
                    return payload.vendor_id;
                }
            }
        }
        catch (e) {
            // Invalid token
        }
    }
    const vendorToken = req.headers["x-vendor-token"] || req.headers["X-Vendor-Token"];
    if (vendorToken) {
        try {
            const parts = vendorToken.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
                if (payload.vendor_id) {
                    return payload.vendor_id;
                }
            }
        }
        catch (e) {
            // Invalid token
        }
    }
    return null;
}
async function POST(req, res) {
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const vendorId = getVendorIdFromRequest(req);
        if (!vendorId) {
            return res.status(401).json({
                message: "Unauthorized. Please provide vendor token."
            });
        }
        // Validate request body
        const validated = ReapplySchema.parse(req.body || {});
        console.log("Vendor reapply request for ID:", vendorId);
        // Reapply vendor (updates data and resets rejection status)
        const vendor = await vendorService.reapplyVendor(vendorId, validated);
        return res.json({
            message: "Reapply successful. Your request is now pending admin review.",
            vendor
        });
    }
    catch (error) {
        console.error("Reapply vendor error:", error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                message: "Invalid request data",
                errors: error.errors
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to reapply",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ZlbmRvcnMvcmVhcHBseS9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQW1GQSxvQkF1Q0M7QUF6SEQsNkJBQXVCO0FBRXZCLHVEQUEwRDtBQUUxRCxNQUFNLGFBQWEsR0FBRyxPQUFDLENBQUMsTUFBTSxDQUFDO0lBQzdCLHVCQUF1QjtJQUN2QixJQUFJLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFDbEMsU0FBUyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDM0MsUUFBUSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDMUMsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDdkMsU0FBUyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFFM0Msb0JBQW9CO0lBQ3BCLFVBQVUsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQzVDLFdBQVcsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQzdDLGFBQWEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQy9DLGFBQWEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQy9DLFlBQVksRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFB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