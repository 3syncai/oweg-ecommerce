"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const vendor_1 = require("../../../../../modules/vendor");
// Medusa v2 automatically protects /admin/* routes with authentication middleware
// If this route handler is reached, the user is already authenticated by Medusa
async function POST(req, res) {
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        // Extract ID from URL path - Medusa v2 approach
        const id = req.params?.id;
        if (!id) {
            console.error("No vendor ID in params:", req.params);
            return res.status(400).json({
                message: "Missing vendor id",
                params: req.params
            });
        }
        // Extract rejection reason from request body
        const body = req.body || {};
        const { rejection_reason } = body;
        if (!rejection_reason || !rejection_reason.trim()) {
            return res.status(400).json({
                message: "Rejection reason is required"
            });
        }
        console.log("Rejecting vendor with ID:", id, "Reason:", rejection_reason);
        const adminId = req.user?.id ?? null;
        // Reject vendor with reason
        const vendor = await vendorService.rejectVendor(id, rejection_reason.trim(), adminId);
        return res.json({
            message: "Vendor rejected successfully",
            vendor,
            id,
            status: "rejected"
        });
    }
    catch (error) {
        console.error("Reject vendor error:", error);
        return res.status(500).json({
            message: error?.message || "Failed to reject vendor",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3ZlbmRvcnMvW2lkXS9yZWplY3Qvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFNQSxvQkFnREM7QUFwREQsMERBQTZEO0FBRTdELGtGQUFrRjtBQUNsRixnRkFBZ0Y7QUFDekUsS0FBSyxVQUFVLElBQUksQ0FDeEIsR0FBa0IsRUFDbEIsR0FBbUI7SUFFbkIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxhQUFhLEdBQXdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLHNCQUFhLENBQUMsQ0FBQTtRQUUzRSxnREFBZ0Q7UUFDaEQsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFZLENBQUE7UUFFbkMsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ1IsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDcEQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsT0FBTyxFQUFFLG1CQUFtQjtnQkFDNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNO2FBQ25CLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFFRCw2Q0FBNkM7UUFDN0MsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQXFDLElBQUksRUFBRSxDQUFBO1FBQzVELE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLElBQUksQ0FBQTtRQUVqQyxJQUFJLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ2xELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSw4QkFBOEI7YUFDeEMsQ0FBQyxDQUFBO1FBQ0osQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFBO1FBRXpFLE1BQU0sT0FBTyxHQUFLLEdBQVcsQ0FBQyxJQUFZLEVBQUUsRUFBRSxJQUFJLElBQUksQ0FBQTtRQUV0RCw0QkFBNEI7UUFDNUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxhQUFhLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUVyRixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDZCxPQUFPLEVBQUUsOEJBQThCO1lBQ3ZDLE1BQU07WUFDTixFQUFFO1lBQ0YsTUFBTSxFQUFFLFVBQVU7U0FDbkIsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUM1QyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLHlCQUF5QjtZQUNwRCxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtTQUN6QixDQUFDLENBQUE7SUFDSixDQUFDO0FBQ0gsQ0FBQyJ9