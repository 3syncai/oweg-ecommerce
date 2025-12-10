"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
const flash_sale_1 = require("../../../../modules/flash-sale");
/**
 * Debug endpoint to check flash sale items in database
 * Accessible at: GET /store/flash-sale/debug
 */
const GET = async (req, res) => {
    try {
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        const now = new Date();
        const allItems = await flashSaleService.listFlashSaleItems({});
        const debugInfo = {
            currentTime: now.toISOString(),
            currentTimeLocal: now.toString(),
            totalItemsInDB: allItems.length,
            items: allItems.map((item) => {
                const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
                const isExpired = expiresAt <= now;
                const isDeleted = !!item.deleted_at;
                const isActive = !isDeleted && !isExpired;
                return {
                    id: item.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    flash_sale_price: item.flash_sale_price,
                    original_price: item.original_price,
                    expires_at: expiresAt.toISOString(),
                    expires_at_local: expiresAt.toString(),
                    deleted_at: item.deleted_at,
                    isExpired,
                    isDeleted,
                    isActive,
                    timeUntilExpiry: isActive ? Math.max(0, expiresAt.getTime() - now.getTime()) : null,
                };
            }),
            activeItemsCount: allItems.filter((item) => {
                if (item.deleted_at)
                    return false;
                const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
                return expiresAt > now;
            }).length,
        };
        return res.json(debugInfo);
    }
    catch (error) {
        console.error("Debug endpoint error:", error);
        return res.status(500).json({
            error: error.message,
            stack: error.stack,
        });
    }
};
exports.GET = GET;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2ZsYXNoLXNhbGUvZGVidWcvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsK0RBQWtFO0FBRWxFOzs7R0FHRztBQUNJLE1BQU0sR0FBRyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUNuRSxJQUFJLENBQUM7UUFDSCxNQUFNLGdCQUFnQixHQUEyQixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyw4QkFBaUIsQ0FBQyxDQUFBO1FBRXJGLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUE7UUFDdEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUU5RCxNQUFNLFNBQVMsR0FBRztZQUNoQixXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRTtZQUM5QixnQkFBZ0IsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFO1lBQ2hDLGNBQWMsRUFBRSxRQUFRLENBQUMsTUFBTTtZQUMvQixLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFO2dCQUNoQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxZQUFZLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFBO2dCQUMvRixNQUFNLFNBQVMsR0FBRyxTQUFTLElBQUksR0FBRyxDQUFBO2dCQUNsQyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQTtnQkFDbkMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUE7Z0JBRXpDLE9BQU87b0JBQ0wsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFO29CQUNYLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtvQkFDM0IsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO29CQUMzQixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsZ0JBQWdCO29CQUN2QyxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWM7b0JBQ25DLFVBQVUsRUFBRSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUNuQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFO29CQUN0QyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7b0JBQzNCLFNBQVM7b0JBQ1QsU0FBUztvQkFDVCxRQUFRO29CQUNSLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtpQkFDcEYsQ0FBQTtZQUNILENBQUMsQ0FBQztZQUNGLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTtnQkFDOUMsSUFBSSxJQUFJLENBQUMsVUFBVTtvQkFBRSxPQUFPLEtBQUssQ0FBQTtnQkFDakMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQTtnQkFDL0YsT0FBTyxTQUFTLEdBQUcsR0FBRyxDQUFBO1lBQ3hCLENBQUMsQ0FBQyxDQUFDLE1BQU07U0FDVixDQUFBO1FBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQzVCLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDN0MsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU87WUFDcEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1NBQ25CLENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDLENBQUE7QUEvQ1ksUUFBQSxHQUFHLE9BK0NmIn0=