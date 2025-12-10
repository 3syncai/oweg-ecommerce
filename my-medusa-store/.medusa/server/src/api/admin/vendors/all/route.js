"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const vendor_1 = require("../../../../modules/vendor");
const utils_1 = require("@medusajs/framework/utils");
async function GET(req, res) {
    try {
        console.log('Admin vendors/all: Request received');
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // Get all vendors
        const allVendors = await vendorService.listVendors({});
        console.log('Admin vendors/all: Total vendors found:', allVendors?.length || 0);
        // Get all products to count vendor products
        const allProducts = await productModuleService.listProducts({});
        // Process vendors and add product counts
        const vendorsWithProducts = (allVendors || []).map((vendor) => {
            // Count products for this vendor
            const vendorProducts = (allProducts || []).filter((p) => {
                const metadata = p.metadata || {};
                return metadata.vendor_id === vendor.id;
            });
            // Determine status
            let status = "pending";
            if (vendor.is_approved && vendor.approved_at) {
                status = "approved";
            }
            else if (vendor.rejected_at) {
                status = "rejected";
            }
            return {
                ...vendor,
                status,
                product_count: vendorProducts.length,
                products: vendorProducts.map((p) => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    approval_status: p.metadata?.approval_status || null,
                    created_at: p.created_at,
                    thumbnail: p.thumbnail,
                })),
            };
        });
        // Separate by status
        const approvedVendors = vendorsWithProducts.filter((v) => v.status === "approved");
        const rejectedVendors = vendorsWithProducts.filter((v) => v.status === "rejected");
        const pendingVendors = vendorsWithProducts.filter((v) => v.status === "pending");
        console.log('Admin vendors/all: Status breakdown:', {
            approved: approvedVendors.length,
            rejected: rejectedVendors.length,
            pending: pendingVendors.length,
        });
        return res.json({
            vendors: vendorsWithProducts,
            approved: approvedVendors,
            rejected: rejectedVendors,
            pending: pendingVendors,
            counts: {
                total: vendorsWithProducts.length,
                approved: approvedVendors.length,
                rejected: rejectedVendors.length,
                pending: pendingVendors.length,
            },
        });
    }
    catch (error) {
        console.error('Admin vendors/all error:', error);
        return res.status(500).json({
            message: "Failed to fetch vendors",
            error: error?.message || String(error),
            vendors: [],
            approved: [],
            rejected: [],
            pending: [],
            counts: {
                total: 0,
                approved: 0,
                rejected: 0,
                pending: 0,
            },
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL3ZlbmRvcnMvYWxsL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBS0Esa0JBc0ZDO0FBekZELHVEQUEwRDtBQUMxRCxxREFBbUQ7QUFFNUMsS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELElBQUksQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQTtRQUVsRCxNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO1FBQzNFLE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBRS9ELGtCQUFrQjtRQUNsQixNQUFNLFVBQVUsR0FBRyxNQUFNLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUE7UUFFdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsRUFBRSxVQUFVLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBRS9FLDRDQUE0QztRQUM1QyxNQUFNLFdBQVcsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUUvRCx5Q0FBeUM7UUFDekMsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFXLEVBQUUsRUFBRTtZQUNqRSxpQ0FBaUM7WUFDakMsTUFBTSxjQUFjLEdBQUcsQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUU7Z0JBQzNELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFBO2dCQUNqQyxP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