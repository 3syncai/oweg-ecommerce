"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const vendor_1 = require("../../../../modules/vendor");
const token_1 = require("../../_lib/token");
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
    const email = body.email;
    const password = body.password;
    if (!email || !password) {
        return res.status(400).json({ message: "email and password required" });
    }
    const user = await vendorService.authenticateVendorUser(email, password);
    const token = (0, token_1.signVendorToken)({ sub: user.id, vendor_id: user.vendor_id, scope: "vendor" });
    // Get vendor details to include rejection status
    let vendor = null;
    if (user.vendor_id) {
        const vendors = await vendorService.listVendors({ id: user.vendor_id });
        if (vendors && vendors.length > 0) {
            vendor = vendors[0];
        }
    }
    return res.json({
        token,
        vendor_user: {
            id: user.id,
            email: user.email,
            vendor_id: user.vendor_id,
            must_reset_password: user?.must_reset_password ?? false,
        },
        vendor: vendor ? {
            id: vendor.id,
            name: vendor.name,
            email: vendor.email,
            is_approved: vendor.is_approved,
            rejected_at: vendor.rejected_at,
            rejection_reason: vendor.rejection_reason,
        } : null,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9hdXRoL2xvZ2luL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBYUEsMEJBR0M7QUFFRCxvQkEyQ0M7QUEzREQsdURBQTBEO0FBQzFELDRDQUFrRDtBQUVsRCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUI7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLEtBQUssVUFBVSxPQUFPLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNuRSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQzlCLENBQUM7QUFFTSxLQUFLLFVBQVUsSUFBSSxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDaEUsbUJBQW1CO0lBQ25CLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUVuQixNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO0lBRTNFLDZEQUE2RDtJQUM3RCxNQUFNLElBQUksR0FBSSxHQUFXLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQTtJQUNwQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFBO0lBQ3hCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUE7SUFFOUIsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3hCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQyxDQUFBO0lBQ3pFLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxNQUFNLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFDeEUsTUFBTSxLQUFLLEdBQUcsSUFBQSx1QkFBZSxFQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUE7SUFFNUYsaURBQWlEO0lBQ2pELElBQUksTUFBTSxHQUFRLElBQUksQ0FBQTtJQUN0QixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNuQixNQUFNLE9BQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUE7UUFDdkUsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxNQUFNLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ3JCLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ2QsS0FBSztRQUNMLFdBQVcsRUFBRTtZQUNYLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUNYLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDekIsbUJBQW1CLEVBQUcsSUFBWSxFQUFFLG1CQUFtQixJQUFJLEtBQUs7U0FDakU7UUFDRCxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNmLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRTtZQUNiLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNqQixLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUs7WUFDbkIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXO1lBQy9CLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztZQUMvQixnQkFBZ0IsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO1NBQzFDLENBQUMsQ0FBQyxDQUFDLElBQUk7S0FDVCxDQUFDLENBQUE7QUFDSixDQUFDIn0=