"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
exports.PUT = PUT;
const guards_1 = require("../_lib/guards");
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
async function GET(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const vendor = await vendorService.retrieveVendor(auth.vendor_id);
        return res.json({ vendor });
    }
    catch (error) {
        console.error("Vendor profile retrieve error:", error);
        return res.status(500).json({ message: error?.message || "Failed to retrieve profile" });
    }
}
async function PUT(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const body = req.body || {};
        const { name, phone, store_name, store_logo, } = body;
        // Only allow updating certain fields
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (phone !== undefined)
            updateData.phone = phone;
        if (store_name !== undefined)
            updateData.store_name = store_name;
        if (store_logo !== undefined)
            updateData.store_logo = store_logo;
        const updated = await vendorService.updateVendors({
            id: auth.vendor_id,
            ...updateData,
        });
        return res.json({ vendor: updated });
    }
    catch (error) {
        console.error("Vendor profile update error:", error);
        return res.status(500).json({ message: error?.message || "Failed to update profile" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9wcm9maWxlL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBYUEsMEJBR0M7QUFFRCxrQkFhQztBQUVELGtCQWlDQztBQWpFRCwyQ0FBc0Q7QUFFdEQsb0RBQXVEO0FBRXZELHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQjtJQUN6QyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2pELEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQTtJQUNoRixHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLG9EQUFvRCxDQUFDLENBQUE7SUFDbkcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUMzRCxDQUFDO0FBRU0sS0FBSyxVQUFVLE9BQU8sQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ25FLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDOUIsQ0FBQztBQUVNLEtBQUssVUFBVSxHQUFHLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUMvRCxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFBLDhCQUFxQixFQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNsRCxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU07SUFFakIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxhQUFhLEdBQXdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLHNCQUFhLENBQUMsQ0FBQTtRQUMzRSxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQ2pFLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDN0IsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUN0RCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFBO0lBQzFGLENBQUM7QUFDSCxDQUFDO0FBRU0sS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQixNQUFNLElBQUksR0FBRyxNQUFNLElBQUEsOEJBQXFCLEVBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2xELElBQUksQ0FBQyxJQUFJO1FBQUUsT0FBTTtJQUVqQixJQUFJLENBQUM7UUFDSCxNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO1FBQzNFLE1BQU0sSUFBSSxHQUFJLEdBQVcsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFBO1FBRXBDLE1BQU0sRUFDSixJQUFJLEVBQ0osS0FBSyxFQUNMLFVBQVUsRUFDVixVQUFVLEdBQ1gsR0FBRyxJQUFJLENBQUE7UUFFUixxQ0FBcUM7UUFDckMsTUFBTSxVQUFVLEdBQVEsRUFBRSxDQUFBO1FBQzFCLElBQUksSUFBSSxLQUFLLFNBQVM7WUFBRSxVQUFVLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQTtRQUM5QyxJQUFJLEtBQUssS0FBSyxTQUFTO1lBQUUsVUFBVSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUE7UUFDakQsSUFBSSxVQUFVLEtBQUssU0FBUztZQUFFLFVBQVUsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFBO1FBQ2hFLElBQUksVUFBVSxLQUFLLFNBQVM7WUFBRSxVQUFVLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQTtRQUVoRSxNQUFNLE9BQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxhQUFhLENBQUM7WUFDaEQsRUFBRSxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ2xCLEdBQUcsVUFBVTtTQUNkLENBQUMsQ0FBQTtRQUVGLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFBO0lBQ3RDLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDcEQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLDBCQUEwQixFQUFFLENBQUMsQ0FBQTtJQUN4RixDQUFDO0FBQ0gsQ0FBQyJ9