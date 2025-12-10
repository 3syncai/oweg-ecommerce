"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const vendor_1 = require("../../../../modules/vendor");
// Get vendor ID from token (simple verification)
function getVendorIdFromRequest(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            // Simple JWT decode (without verification for now - you should add proper verification)
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
    // Check X-Vendor-Token header (fallback)
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
async function GET(req, res) {
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const vendorId = getVendorIdFromRequest(req);
        if (!vendorId) {
            return res.status(401).json({
                message: "Unauthorized. Please provide vendor token."
            });
        }
        const vendors = await vendorService.listVendors({ id: vendorId });
        if (!vendors || vendors.length === 0) {
            return res.status(404).json({
                message: "Vendor not found"
            });
        }
        const vendor = vendors[0];
        return res.json({
            vendor
        });
    }
    catch (error) {
        console.error("Get vendor error:", error);
        return res.status(500).json({
            message: error?.message || "Failed to fetch vendor",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ZlbmRvcnMvbWUvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyQ0Esa0JBZ0NDO0FBekVELHVEQUEwRDtBQUUxRCxpREFBaUQ7QUFDakQsU0FBUyxzQkFBc0IsQ0FBQyxHQUFrQjtJQUNoRCw2QkFBNkI7SUFDN0IsTUFBTSxVQUFVLEdBQUksR0FBRyxDQUFDLE9BQWUsQ0FBQyxhQUFhLElBQUssR0FBRyxDQUFDLE9BQWUsQ0FBQyxhQUFhLENBQUE7SUFDM0YsSUFBSSxVQUFVLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ25ELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFDO1lBQ0gsd0ZBQXdGO1lBQ3hGLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDOUIsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUE7Z0JBQ3RFLElBQUksT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUN0QixPQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUE7Z0JBQzFCLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxnQkFBZ0I7UUFDbEIsQ0FBQztJQUNILENBQUM7SUFFRCx5Q0FBeUM7SUFDekMsTUFBTSxXQUFXLEdBQUksR0FBRyxDQUFDLE9BQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFLLEdBQUcsQ0FBQyxPQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtJQUNwRyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQztZQUNILE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDcEMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUE7Z0JBQ3RFLElBQUksT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUN0QixPQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUE7Z0JBQzFCLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxnQkFBZ0I7UUFDbEIsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQTtBQUNiLENBQUM7QUFFTSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsSUFBSSxDQUFDO1FBQ0gsTUFBTSxhQUFhLEdBQXdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLHNCQUFhLENBQUMsQ0FBQTtRQUUzRSxNQUFNLFFBQVEsR0FBRyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUU1QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixPQUFPLEVBQUUsNENBQTRDO2FBQ3RELENBQUMsQ0FBQTtRQUNKLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQTtRQUVqRSxJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsT0FBTyxFQUFFLGtCQUFrQjthQUM1QixDQUFDLENBQUE7UUFDSixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBRXpCLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztZQUNkLE1BQU07U0FDUCxDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxDQUFBO1FBQ3pDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDMUIsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksd0JBQXdCO1lBQ25ELEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO1NBQ3pCLENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDIn0=