"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const vendor_1 = require("../../../../../modules/vendor");
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
        console.log("Approving vendor with ID:", id);
        const adminId = req.user?.id ?? null;
        const vendor = await vendorService.approveVendor(id, adminId);
        return res.json({
            message: "Vendor approved successfully",
            vendor
        });
    }
    catch (error) {
        console.error("Approve vendor error:", error);
        return res.status(500).json({
            message: error?.message || "Failed to approve vendor",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3ZlbmRvcnMvW2lkXS9hcHByb3ZlL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBSUEsb0JBa0NDO0FBcENELDBEQUE2RDtBQUV0RCxLQUFLLFVBQVUsSUFBSSxDQUN4QixHQUFrQixFQUNsQixHQUFtQjtJQUVuQixJQUFJLENBQUM7UUFDSCxNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO1FBRTNFLGdEQUFnRDtRQUNoRCxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQVksQ0FBQTtRQUVuQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDUixPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUNwRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixPQUFPLEVBQUUsbUJBQW1CO2dCQUM1QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU07YUFDbkIsQ0FBQyxDQUFBO1FBQ0osQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxDQUFDLENBQUE7UUFFNUMsTUFBTSxPQUFPLEdBQUssR0FBVyxDQUFDLElBQVksRUFBRSxFQUFFLElBQUksSUFBSSxDQUFBO1FBQ3RELE1BQU0sTUFBTSxHQUFHLE1BQU0sYUFBYSxDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFFN0QsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsT0FBTyxFQUFFLDhCQUE4QjtZQUN2QyxNQUFNO1NBQ1AsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUM3QyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLDBCQUEwQjtZQUNyRCxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtTQUN6QixDQUFDLENBQUE7SUFDSixDQUFDO0FBQ0gsQ0FBQyJ9