"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const flash_sale_item_1 = __importDefault(require("./models/flash-sale-item"));
class FlashSaleModuleService extends (0, utils_1.MedusaService)({
    FlashSaleItem: flash_sale_item_1.default,
}) {
    /**
     * Create a flash sale item with price override
     */
    async createFlashSaleItem(input) {
        const expiresAt = typeof input.expires_at === 'string' ? new Date(input.expires_at) : input.expires_at;
        const now = new Date();
        if (expiresAt <= now) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Expires at must be in the future");
        }
        // Store the flash sale item (price override happens on fetch/display)
        return await this.createFlashSaleItems({
            product_id: input.product_id,
            variant_id: input.variant_id,
            flash_sale_price: input.flash_sale_price,
            original_price: input.original_price,
            original_price_id: null, // Will be set when we fetch original price
            expires_at: expiresAt,
        });
    }
    /**
     * Create multiple flash sale items (batch)
     */
    async createFlashSaleItemsBatch(input) {
        const now = new Date();
        // Validate all expire in the future
        for (const item of input) {
            const expiresAt = typeof item.expires_at === 'string' ? new Date(item.expires_at) : item.expires_at;
            if (expiresAt <= now) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Expires at must be in the future for product ${item.product_id}`);
            }
        }
        // Format items
        const items = input.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            flash_sale_price: item.flash_sale_price,
            original_price: item.original_price,
            original_price_id: null,
            expires_at: typeof item.expires_at === 'string' ? new Date(item.expires_at) : item.expires_at,
        }));
        return await super.createFlashSaleItems(items);
    }
    /**
     * Update a flash sale item
     */
    async updateFlashSaleItem(id, input) {
        const updateData = {};
        if (input.product_id !== undefined)
            updateData.product_id = input.product_id;
        if (input.variant_id !== undefined)
            updateData.variant_id = input.variant_id;
        if (input.flash_sale_price !== undefined)
            updateData.flash_sale_price = input.flash_sale_price;
        if (input.original_price !== undefined)
            updateData.original_price = input.original_price;
        if (input.expires_at !== undefined) {
            const expiresAt = typeof input.expires_at === 'string' ? new Date(input.expires_at) : input.expires_at;
            if (expiresAt <= new Date()) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Expires at must be in the future");
            }
            updateData.expires_at = expiresAt;
        }
        updateData.updated_at = new Date();
        return await this.updateFlashSaleItems({ id }, updateData);
    }
    /**
     * Get active flash sale items (not expired and not deleted)
     */
    async getActiveFlashSaleItems() {
        const now = new Date();
        const allItems = await this.listFlashSaleItems({});
        console.log(`[FlashSaleService] Checking ${allItems.length} flash sale items...`);
        console.log(`[FlashSaleService] Current time: ${now.toISOString()}`);
        // Filter out expired and deleted items
        const activeItems = allItems.filter((item) => {
            if (item.deleted_at) {
                console.log(`[FlashSaleService] Item ${item.id} is deleted`);
                return false;
            }
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            const isActive = expiresAt > now;
            console.log(`[FlashSaleService] Item ${item.id}: expires_at=${expiresAt.toISOString()}, isActive=${isActive}, product_id=${item.product_id}`);
            return isActive;
        });
        console.log(`[FlashSaleService] Found ${activeItems.length} active items`);
        return activeItems;
    }
    /**
     * Get flash sale items by product ID
     */
    async getFlashSaleItemsByProduct(productId) {
        const now = new Date();
        const items = await this.listFlashSaleItems({
            product_id: productId,
        });
        // Return only active items
        return items.filter((item) => {
            if (item.deleted_at)
                return false;
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            return expiresAt > now;
        });
    }
    /**
     * Get flash sale price override for a product
     * Returns flash sale price if active, null otherwise
     */
    async getFlashSalePriceOverride(productId, variantId) {
        const now = new Date();
        const items = await this.listFlashSaleItems({
            product_id: productId,
        });
        // Find active flash sale item
        const activeItem = items.find((item) => {
            if (item.deleted_at)
                return false;
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            if (expiresAt <= now)
                return false;
            // If variant_id specified, match it; otherwise use first active item
            if (variantId) {
                return item.variant_id === variantId;
            }
            return true;
        });
        if (activeItem) {
            return {
                flash_sale_price: activeItem.flash_sale_price,
                original_price: activeItem.original_price,
                expires_at: activeItem.expires_at,
            };
        }
        return null;
    }
    /**
     * Delete expired flash sale items (soft delete)
     */
    async cleanupExpiredItems() {
        const now = new Date();
        const allItems = await this.listFlashSaleItems({});
        const expiredItems = allItems.filter((item) => {
            if (item.deleted_at)
                return false;
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            return expiresAt <= now;
        });
        if (expiredItems.length > 0) {
            await this.updateFlashSaleItems({ id: expiredItems.map(item => item.id) }, { deleted_at: now, updated_at: now });
        }
        return expiredItems.length;
    }
    /**
     * Delete a flash sale item
     */
    async deleteFlashSaleItem(id) {
        return await this.deleteFlashSaleItems(id);
    }
}
exports.default = FlashSaleModuleService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2ZsYXNoLXNhbGUvc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHFEQUFzRTtBQUV0RSwrRUFBb0Q7QUFFcEQsTUFBTSxzQkFBdUIsU0FBUSxJQUFBLHFCQUFhLEVBQUM7SUFDakQsYUFBYSxFQUFiLHlCQUFhO0NBQ2QsQ0FBQztJQUNBOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG1CQUFtQixDQUFDLEtBTXpCO1FBQ0MsTUFBTSxTQUFTLEdBQUcsT0FBTyxLQUFLLENBQUMsVUFBVSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFBO1FBQ3RHLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUE7UUFFdEIsSUFBSSxTQUFTLElBQUksR0FBRyxFQUFFLENBQUM7WUFDckIsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFDOUIsa0NBQWtDLENBQ25DLENBQUE7UUFDSCxDQUFDO1FBRUQsc0VBQXNFO1FBQ3RFLE9BQU8sTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUM7WUFDckMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO1lBQzVCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtZQUM1QixnQkFBZ0IsRUFBRSxLQUFLLENBQUMsZ0JBQWdCO1lBQ3hDLGNBQWMsRUFBRSxLQUFLLENBQUMsY0FBYztZQUNwQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsMkNBQTJDO1lBQ3BFLFVBQVUsRUFBRSxTQUFTO1NBQ3RCLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxLQU05QjtRQUNBLE1BQU0sR0FBRyxH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