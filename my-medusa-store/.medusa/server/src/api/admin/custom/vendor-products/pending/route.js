"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
const utils_1 = require("@medusajs/framework/utils");
const vendor_1 = require("../../../../../modules/vendor");
const GET = async (req, res) => {
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        // Get all products
        const allProducts = await productModuleService.listProducts({});
        console.log("Total products fetched:", allProducts?.length || 0);
        // Filter products with pending approval status
        const pendingProducts = (allProducts || []).filter((p) => {
            const metadata = p.metadata || {};
            const hasPendingStatus = metadata.approval_status === "pending";
            // Log for debugging
            if (metadata.vendor_id) {
                console.log(`Product ${p.id}: vendor_id=${metadata.vendor_id}, approval_status=${metadata.approval_status}, status=${p.status}`);
            }
            return hasPendingStatus;
        });
        console.log("Pending products found:", pendingProducts.length);
        // Get all vendors to map vendor_id to vendor info
        const allVendors = await vendorService.listVendors({});
        const vendorMap = new Map();
        allVendors.forEach((v) => {
            vendorMap.set(v.id, v);
        });
        // Enrich products with vendor information
        const productsWithVendor = pendingProducts.map((p) => {
            const metadata = p.metadata || {};
            const vendorId = metadata.vendor_id;
            const vendor = vendorId ? vendorMap.get(vendorId) : null;
            return {
                ...p,
                vendor: vendor ? {
                    id: vendor.id,
                    name: vendor.name,
                    store_name: vendor.store_name,
                    email: vendor.email,
                } : null,
            };
        });
        return res.json({ products: productsWithVendor });
    }
    catch (error) {
        console.error("Error fetching pending products:", error);
        return res.status(500).json({
            message: "Failed to fetch pending products",
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.GET = GET;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2N1c3RvbS92ZW5kb3ItcHJvZHVjdHMvcGVuZGluZy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxxREFBbUQ7QUFFbkQsMERBQTZEO0FBRXRELE1BQU0sR0FBRyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUNuRSxJQUFJLENBQUM7UUFDSCxNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUMvRCxNQUFNLGFBQWEsR0FBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxDQUFBO1FBRTNFLG1CQUFtQjtRQUNuQixNQUFNLFdBQVcsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUUvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLFdBQVcsRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUE7UUFFaEUsK0NBQStDO1FBQy9DLE1BQU0sZUFBZSxHQUFHLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFO1lBQzVELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFBO1lBQ2pDLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLGVBQWUsS0FBSyxTQUFTLENBQUE7WUFFL0Qsb0JBQW9CO1lBQ3BCLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsZUFBZSxRQUFRLENBQUMsU0FBUyxxQkFBcUIsUUFBUSxDQUFDLGVBQWUsWUFBWSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQTtZQUNsSSxDQUFDO1lBRUQsT0FBTyxnQkFBZ0IsQ0FBQTtRQUN6QixDQUFDLENBQUMsQ0FBQTtRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBRTlELGtEQUFrRDtRQUNsRCxNQUFNLFVBQVUsR0FBRyxNQUFNLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDdEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUMzQixVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUU7WUFDNUIsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFBO1FBQ3hCLENBQUMsQ0FBQyxDQUFBO1FBRUYsMENBQTBDO1FBQzFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFO1lBQ3hELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFBO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUE7WUFDbkMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7WUFFeEQsT0FBTztnQkFDTCxHQUFHLENBQUM7Z0JBQ0osTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ2YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxFQUFFO29CQUNiLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtvQkFDakIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxVQUFVO29CQUM3QixLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUs7aUJBQ3BCLENBQUMsQ0FBQyxDQUFDLElBQUk7YUFDVCxDQUFBO1FBQ0gsQ0FBQyxDQUFDLENBQUE7UUFFRixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFBO0lBQ25ELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUN4RCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxrQ0FBa0M7WUFDM0MsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7U0FDOUQsQ0FBQyxDQUFBO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQTtBQXpEWSxRQUFBLEdBQUcsT0F5RGYifQ==