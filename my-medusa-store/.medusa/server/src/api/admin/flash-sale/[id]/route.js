"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELETE = exports.PUT = void 0;
const flash_sale_1 = require("../../../../modules/flash-sale");
const PUT = async (req, res) => {
    try {
        const { id } = req.params;
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        const { product_id, variant_id, price_id, flash_sale_price, original_price, original_price_id, expires_at } = req.body;
        // Input validation
        const errors = [];
        // Validate required fields
        if (!product_id) {
            errors.push("product_id is required");
        }
        // Validate numeric fields
        if (flash_sale_price !== undefined && flash_sale_price !== null) {
            if (typeof flash_sale_price !== 'number' || !Number.isFinite(flash_sale_price) || flash_sale_price < 0) {
                errors.push("flash_sale_price must be a valid positive number");
            }
        }
        if (original_price !== undefined && original_price !== null) {
            if (typeof original_price !== 'number' || !Number.isFinite(original_price) || original_price < 0) {
                errors.push("original_price must be a valid positive number");
            }
        }
        // Validate expires_at is a valid future date
        if (expires_at) {
            const expiresDate = new Date(expires_at);
            if (isNaN(expiresDate.getTime())) {
                errors.push("expires_at must be a valid date");
            }
            else if (expiresDate <= new Date()) {
                errors.push("expires_at must be a future date");
            }
        }
        // Validate ID formats (basic check - should be non-empty strings)
        if (product_id && typeof product_id !== 'string') {
            errors.push("product_id must be a string");
        }
        if (variant_id !== undefined && variant_id !== null && typeof variant_id !== 'string') {
            errors.push("variant_id must be a string");
        }
        if (price_id !== undefined && price_id !== null && typeof price_id !== 'string') {
            errors.push("price_id must be a string");
        }
        if (original_price_id !== undefined && original_price_id !== null && typeof original_price_id !== 'string') {
            errors.push("original_price_id must be a string");
        }
        if (errors.length > 0) {
            return res.status(400).json({
                message: "Validation failed",
                errors
            });
        }
        const updatedItem = await flashSaleService.updateFlashSaleItem(id, {
            product_id,
            variant_id,
            price_id,
            flash_sale_price,
            original_price,
            original_price_id,
            expires_at,
        });
        return res.json({ flash_sale_item: updatedItem });
    }
    catch (error) {
        console.error("Error updating flash sale item:", error);
        if (error.type === "not_found") {
            return res.status(404).json({
                message: "Flash sale item not found",
                error: error.message
            });
        }
        return res.status(500).json({
            message: "Failed to update flash sale item",
            error: error.message
        });
    }
};
exports.PUT = PUT;
const DELETE = async (req, res) => {
    try {
        const { id } = req.params;
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        await flashSaleService.deleteFlashSaleItem(id);
        return res.json({ message: "Flash sale item deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting flash sale item:", error);
        return res.status(500).json({
            message: "Failed to delete flash sale item",
            error: error.message
        });
    }
};
exports.DELETE = DELETE;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2ZsYXNoLXNhbGUvW2lkXS9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwrREFBa0U7QUFFM0QsTUFBTSxHQUFHLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ25FLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFBO1FBQ3pCLE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDhCQUFpQixDQUFDLENBQUE7UUFFckYsTUFBTSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFBO1FBRXRILG1CQUFtQjtRQUNuQixNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUE7UUFFM0IsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUE7UUFDdkMsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixJQUFJLGdCQUFnQixLQUFLLFNBQVMsSUFBSSxnQkFBZ0IsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoRSxJQUFJLE9BQU8sZ0JBQWdCLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGdCQUFnQixHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN2RyxNQUFNLENBQUMsSUFBSSxDQUFDLGtEQUFrRCxDQUFDLENBQUE7WUFDakUsQ0FBQztRQUNILENBQUM7UUFFRCxJQUFJLGNBQWMsS0FBSyxTQUFTLElBQUksY0FBYyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzVELElBQUksT0FBTyxjQUFjLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxjQUFjLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pHLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0RBQWdELENBQUMsQ0FBQTtZQUMvRCxDQUFDO1FBQ0gsQ0FBQztRQUVELDZDQUE2QztRQUM3QyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsTUFBTSxXQUFXLEdBQUcsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUE7WUFDeEMsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFBO1lBQ2hELENBQUM7aUJBQU0sSUFBSSxXQUFXLElBQUksSUFBSSxJQUFJLEVBQUUsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLENBQUE7WUFDakQsQ0FBQztRQUNILENBQUM7UUFFRCxrRUFBa0U7UUFDbEUsSUFBSSxVQUFVLElBQUksT0FBTyxVQUFVLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFBO1FBQzVDLENBQUM7UUFDRCxJQUFJLFVBQVUsS0FBSyxTQUFTLElBQUksVUFBVSxLQUFLLElBQUksSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN0RixNQUFNLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUE7UUFDNUMsQ0FBQztRQUNELElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssSUFBSSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQTtRQUMxQyxDQUFDO1FBQ0QsSUFBSSxpQkFBaUIsS0FBSyxTQUFTLElBQUksaUJBQWlCLEtBQUssSUFBSSxJQUFJLE9BQU8saUJBQWlCLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDM0csTUFBTSxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFBO1FBQ25ELENBQUM7UUFFRCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsT0FBTyxFQUFFLG1CQUFtQjtnQkFDNUIsTUFBTTthQUNQLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxNQUFNLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRTtZQUNqRSxVQUFVO1lBQ1YsVUFBVTtZQUNWLFFBQVE7WUFDUixnQkFBZ0I7WUFDaEIsY0FBYztZQUNkLGlCQUFpQjtZQUNqQixVQUFVO1NBQ1gsQ0FBQyxDQUFBO1FBRUYsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUE7SUFDbkQsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUN2RCxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDL0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsT0FBTyxFQUFFLDJCQUEyQjtnQkFDcEMsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPO2FBQ3JCLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxrQ0FBa0M7WUFDM0MsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPO1NBQ3JCLENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDLENBQUE7QUFuRlksUUFBQSxHQUFHLE9BbUZmO0FBRU0sTUFBTSxNQUFNLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ3RFLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFBO1FBQ3pCLE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDhCQUFpQixDQUFDLENBQUE7UUFFckYsTUFBTSxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUU5QyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQyxDQUFBO0lBQ3RFLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDdkQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsa0NBQWtDO1lBQzNDLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTztTQUNyQixDQUFDLENBQUE7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFBO0FBZlksUUFBQSxNQUFNLFVBZWxCIn0=