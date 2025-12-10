"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = void 0;
const utils_1 = require("@medusajs/framework/utils");
const POST = async (req, res) => {
    try {
        const { id } = req.params;
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // Get existing product to preserve metadata
        const existingProduct = await productModuleService.retrieveProduct(id);
        const existingMetadata = existingProduct.metadata || {};
        // Update product to rejected status, merging with existing metadata
        const updatedProduct = await productModuleService.updateProducts(id, {
            status: utils_1.ProductStatus.REJECTED,
            metadata: {
                ...existingMetadata,
                approval_status: "rejected",
                rejected_at: new Date().toISOString(),
                rejected_by: "admin", // You can get actual admin ID from session
            },
        });
        return res.json({ product: updatedProduct });
    }
    catch (error) {
        console.error("Error rejecting product:", error);
        return res.status(500).json({
            message: "Failed to reject product",
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2N1c3RvbS92ZW5kb3ItcHJvZHVjdHMvW2lkXS9yZWplY3Qvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscURBQWtFO0FBRTNELE1BQU0sSUFBSSxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUNwRSxJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsRUFBRSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQTtRQUN6QixNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUUvRCw0Q0FBNEM7UUFDNUMsTUFBTSxlQUFlLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDdEUsTUFBTSxnQkFBZ0IsR0FBSSxlQUF1QixDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUE7UUFFaEUsb0VBQW9FO1FBQ3BFLE1BQU0sY0FBYyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsY0FBYyxDQUFDLEVBQUUsRUFBRTtZQUNuRSxNQUFNLEVBQUUscUJBQWEsQ0FBQyxRQUFRO1lBQzlCLFFBQVEsRUFBRTtnQkFDUixHQUFHLGdCQUFnQjtnQkFDbkIsZUFBZSxFQUFFLFVBQVU7Z0JBQzNCLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDckMsV0FBVyxFQUFFLE9BQU8sRUFBRSwyQ0FBMkM7YUFDbEU7U0FDRixDQUFDLENBQUE7UUFFRixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQTtJQUM5QyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDaEQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsMEJBQTBCO1lBQ25DLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQzlELENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDLENBQUE7QUE1QlksUUFBQSxJQUFJLFFBNEJoQiJ9