"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const zod_1 = require("zod");
const vendor_1 = require("../../../../modules/vendor");
const SignupSchema = zod_1.z.object({
    // Personal Information
    name: zod_1.z.string().min(1),
    firstName: zod_1.z.string().optional(),
    lastName: zod_1.z.string().optional(),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().optional(),
    telephone: zod_1.z.string().optional(),
    // Store Information
    store_name: zod_1.z.string().optional(),
    store_phone: zod_1.z.string().optional(),
    store_address: zod_1.z.string().optional(),
    store_country: zod_1.z.string().optional(),
    store_region: zod_1.z.string().optional(),
    store_city: zod_1.z.string().optional(),
    store_pincode: zod_1.z.string().optional(),
    store_logo: zod_1.z.string().optional(),
    store_banner: zod_1.z.string().optional(),
    shipping_policy: zod_1.z.string().optional(),
    return_policy: zod_1.z.string().optional(),
    whatsapp_number: zod_1.z.string().optional(),
    // Tax & Legal Information
    pan_gst: zod_1.z.string().optional(), // Legacy combined field
    gst_no: zod_1.z.string().optional(),
    pan_no: zod_1.z.string().optional(),
    // Banking Information
    bank_name: zod_1.z.string().optional(),
    account_no: zod_1.z.string().optional(),
    ifsc_code: zod_1.z.string().optional(),
    cancel_cheque_url: zod_1.z.string().optional(),
    // Documents
    documents: zod_1.z
        .array(zod_1.z.object({
        key: zod_1.z.string(),
        url: zod_1.z.string().url(),
        name: zod_1.z.string().optional(),
        type: zod_1.z.string().optional(),
    }))
        .optional(),
    // Password
    password: zod_1.z.string().min(8, "Password must be at least 8 characters").optional(),
});
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res);
    return res.status(200).end();
}
async function POST(req, res) {
    // Set CORS headers
    setCorsHeaders(res);
    const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
    // In Medusa v2 (Express), JSON body is available on req.body
    const body = req.body ?? {};
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    const { password, ...vendorData } = parsed.data;
    const created = await vendorService.createPendingVendor(vendorData);
    // If password provided at signup, create a vendor user now (still requires approval to use dashboard)
    if (password && password.length >= 8) {
        try {
            await vendorService.createVendorUser({
                email: vendorData.email,
                password,
                vendor_id: created.id,
            });
            // leave must_reset_password at its default (true) so they are prompted to reset on first login
        }
        catch (e) {
            // If user already exists, ignore; admin can manage credentials
            // Do not fail the vendor creation because of a user creation issue
            console.warn("Create vendor user skipped:", e?.message || e);
        }
    }
    return res.status(201).json({ vendor: created });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ZlbmRvcnMvc2lnbnVwL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBK0RBLDBCQUdDO0FBRUQsb0JBOEJDO0FBakdELDZCQUF1QjtBQUV2Qix1REFBMEQ7QUFFMUQsTUFBTSxZQUFZLEdBQUcsT0FBQyxDQUFDLE1BQU0sQ0FBQztJQUM1Qix1QkFBdUI7SUFDdkIsSUFBSSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3ZCLFNBQVMsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2hDLFFBQVEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQy9CLEtBQUssRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFO0lBQ3pCLEtBQUssRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQzVCLFNBQVMsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBRWhDLG9CQUFvQjtJQUNwQixVQUFVLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNqQyxXQUFXLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNsQyxhQUFhLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNwQyxhQUFhLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNwQyxZQUFZLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNuQyxVQUFVLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNqQyxhQUFhLEVBQUUs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