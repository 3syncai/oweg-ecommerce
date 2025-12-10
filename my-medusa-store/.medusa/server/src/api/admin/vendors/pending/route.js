"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const vendor_1 = require("../../../../modules/vendor");
// Medusa v2 automatically protects /admin/* routes with authentication middleware
// If this route handler is reached, the user is already authenticated by Medusa
async function GET(req, res) {
    try {
        console.log('Admin vendors/pending: Request received');
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        // MedusaService list accepts plain filter object (not nested under `filters`)
        // Get all unapproved vendors
        const allUnapproved = await vendorService.listVendors({ is_approved: false });
        // Filter out rejected vendors (only show truly pending vendors)
        // A vendor is pending if: is_approved = false AND rejected_at IS NULL
        const pendingVendors = (allUnapproved || []).filter((vendor) => {
            return !vendor.rejected_at && !vendor.is_approved;
        });
        console.log('Admin vendors/pending: Successfully fetched', pendingVendors?.length || 0, 'pending vendors (filtered out rejected)');
        // Return vendors array - empty if none found
        return res.json({
            vendors: pendingVendors || [],
            count: pendingVendors?.length || 0
        });
    }
    catch (error) {
        console.error('Admin vendors/pending error:', error);
        console.error('Error details:', {
            message: error?.message,
            stack: error?.stack,
            name: error?.name
        });
        // Return empty array on error to prevent UI breakage
        return res.json({
            vendors: [],
            count: 0,
            message: error?.message || "Failed to fetch vendors"
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3ZlbmRvcnMvcGVuZGluZy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQU1BLGtCQXNDQztBQTFDRCx1REFBMEQ7QUFFMUQsa0ZBQWtGO0FBQ2xGLGdGQUFnRjtBQUN6RSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFBO1FBRXRELE1BQU0sYUFBYSxHQUF3QixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxzQkFBYSxDQUFDLENBQUE7UUFFM0UsOEVBQThFO1FBQzlFLDZCQUE2QjtRQUM3QixNQUFNLGFBQWEsR0FBRyxNQUFNLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUU3RSxnRUFBZ0U7UUFDaEUsc0VBQXNFO1FBQ3RFLE1BQU0sY0FBYyxHQUFHLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO1lBQ2xFLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQTtRQUNuRCxDQUFDLENBQUMsQ0FBQTtRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkNBQTZDLEVBQUUsY0FBYyxFQUFFLE1BQU0sSUFBSSxDQUFDLEVBQUUseUNBQXlDLENBQUMsQ0FBQTtRQUVsSSw2Q0FBNkM7UUFDN0MsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsT0FBTyxFQUFFLGNBQWMsSUFBSSxFQUFFO1lBQzdCLEtBQUssRUFBRSxjQUFjLEVBQUUsTUFBTSxJQUFJLENBQUM7U0FDbkMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUNwRCxPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFO1lBQzlCLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTztZQUN2QixLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7WUFDbkIsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJO1NBQ2xCLENBQUMsQ0FBQTtRQUVGLHFEQUFxRDtRQUNyRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDZCxPQUFPLEVBQUUsRUFBRTtZQUNYLEtBQUssRUFBRSxDQUFDO1lBQ1IsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUkseUJBQXlCO1NBQ3JELENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDIn0=