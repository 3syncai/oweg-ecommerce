"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const vendor_1 = require("../../../modules/vendor");
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
    setCorsHeaders(res);
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const body = req.body ?? {};
        const { field, value } = body;
        if (!field || !value) {
            return res.status(400).json({ message: "Field and value are required" });
        }
        // Get all vendors to check for duplicates
        const allVendors = await vendorService.listVendors({});
        let exists = false;
        let message = "";
        switch (field) {
            case "email":
                exists = allVendors.some((v) => v.email?.toLowerCase() === value.toLowerCase());
                message = exists ? "Email already exists" : "";
                break;
            case "phone":
            case "telephone":
                // Check both phone and telephone fields
                const phoneValue = value.replace(/\D/g, ""); // Remove non-digits
                exists = allVendors.some((v) => {
                    const vPhone = v.phone?.replace(/\D/g, "") || "";
                    const vTelephone = v.telephone?.replace(/\D/g, "") || "";
                    return vPhone === phoneValue || vTelephone === phoneValue;
                });
                message = exists ? "Phone number already exists" : "";
                break;
            case "pan_no":
                const panValue = value.toUpperCase().replace(/\s/g, "");
                exists = allVendors.some((v) => {
                    const vPan = v.pan_no?.toUpperCase().replace(/\s/g, "") || "";
                    return vPan === panValue;
                });
                message = exists ? "PAN number already exists" : "";
                break;
            case "gst_no":
                const gstValue = value.toUpperCase().replace(/\s/g, "");
                exists = allVendors.some((v) => {
                    const vGst = v.gst_no?.toUpperCase().replace(/\s/g, "") || "";
                    return vGst === gstValue;
                });
                message = exists ? "GST number already exists" : "";
                break;
            case "store_name":
                const storeNameValue = value.trim();
                exists = allVendors.some((v) => {
                    const vStoreName = (v.store_name || "").trim();
                    return vStoreName.toLowerCase() === storeNameValue.toLowerCase() && vStoreName !== "";
                });
                message = exists ? "Store name already exists" : "";
                break;
            case "store_phone":
                const storePhoneDigits = value.replace(/\D/g, "");
                exists = allVendors.some((v) => {
                    const vStorePhone = (v.store_phone || "").replace(/\D/g, "");
                    return vStorePhone === storePhoneDigits && vStorePhone !== "";
                });
                message = exists ? "Store phone number already exists" : "";
                break;
            default:
                return res.status(400).json({ message: "Invalid field" });
        }
        return res.json({
            exists,
            message,
        });
    }
    catch (error) {
        console.error("Validation error:", error);
        return res.status(500).json({
            message: "Validation failed",
            error: error?.message || String(error),
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvcnMvdmFsaWRhdGUvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFZQSwwQkFHQztBQUVELG9CQXVGQztBQXRHRCxvREFBdUQ7QUFFdkQsc0JBQXNCO0FBQ3RCLFNBQVMsY0FBYyxDQUFDLEdBQW1CO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDakQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxLQUFLLFVBQVUsT0FBTyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDbkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtBQUM5QixDQUFDO0FBRU0sS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUVuQixJQUFJLENBQUM7UUFDSCxNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO1FBQzNFLE1BQU0sSUFBSSxHQUFJLEdBQVcsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFBO1FBQ3BDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFBO1FBRTdCLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNyQixPQUFP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