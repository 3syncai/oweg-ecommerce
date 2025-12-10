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
        // Update product to approved status, merging with existing metadata
        const updatedProduct = await productModuleService.updateProducts(id, {
            status: utils_1.ProductStatus.PUBLISHED,
            metadata: {
                ...existingMetadata,
                approval_status: "approved",
                approved_at: new Date().toISOString(),
                approved_by: "admin", // You can get actual admin ID from session
            },
        });
        // Ensure product is linked to default sales channel
        try {
            const salesChannelModuleService = req.scope.resolve(utils_1.Modules.SALES_CHANNEL);
            const defaultSalesChannels = await salesChannelModuleService.listSalesChannels({
                name: "Default Sales Channel",
            });
            if (defaultSalesChannels && defaultSalesChannels.length > 0) {
                const defaultSalesChannel = defaultSalesChannels[0];
                const linkModule = req.scope.resolve(utils_1.ContainerRegistrationKeys.LINK);
                // Try to create link (will fail gracefully if it already exists)
                try {
                    await linkModule.create({
                        [utils_1.Modules.PRODUCT]: {
                            product_id: id,
                        },
                        [utils_1.Modules.SALES_CHANNEL]: {
                            sales_channel_id: defaultSalesChannel.id,
                        },
                    });
                    console.log(`✅ Linked product ${id} to default sales channel ${defaultSalesChannel.id} on approval`);
                }
                catch (createError) {
                    // Link might already exist, which is fine
                    if (createError?.message?.includes("already exists") || createError?.message?.includes("duplicate")) {
                        console.log(`ℹ️ Product ${id} already linked to default sales channel`);
                    }
                    else {
                        throw createError;
                    }
                }
            }
        }
        catch (linkError) {
            console.warn("⚠️ Failed to link product to sales channel on approval:", linkError?.message);
            // Don't fail approval if sales channel linking fails
        }
        return res.json({ product: updatedProduct });
    }
    catch (error) {
        console.error("Error approving product:", error);
        return res.status(500).json({
            message: "Failed to approve product",
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2N1c3RvbS92ZW5kb3ItcHJvZHVjdHMvW2lkXS9hcHByb3ZlL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFEQUE2RjtBQUV0RixNQUFNLElBQUksR0FBRyxLQUFLLEVBQUUsR0FBa0IsRUFBRSxHQUFtQixFQUFFLEVBQUU7SUFDcEUsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLEVBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUE7UUFDekIsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFL0QsNENBQTRDO1FBQzVDLE1BQU0sZUFBZSxHQUFHLE1BQU0sb0JBQW9CLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQ3RFLE1BQU0sZ0JBQWdCLEdBQUksZUFBdUIsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFBO1FBRWhFLG9FQUFvRTtRQUNwRSxNQUFNLGNBQWMsR0FBRyxNQUFNLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUU7WUFDbkUsTUFBTSxFQUFFLHFCQUFhLENBQUMsU0FBUztZQUMvQixRQUFRLEVBQUU7Z0JBQ1IsR0FBRyxnQkFBZ0I7Z0JBQ25CLGVBQWUsRUFBRSxVQUFVO2dCQUMzQixXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ3JDLFdBQVcsRUFBRSxPQUFPLEVBQUUsMkNBQTJDO2FBQ2xFO1NBQ0YsQ0FBQyxDQUFBO1FBRUYsb0RBQW9EO1FBQ3BELElBQUksQ0FBQztZQUNILE1BQU0seUJBQXlCLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLGFBQWEsQ0FBQyxDQUFBO1lBQzFFLE1BQU0sb0JBQW9CLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDN0UsSUFBSSxFQUFFLHVCQUF1QjthQUM5QixDQUFDLENBQUE7WUFFRixJQUFJLG9CQUFvQixJQUFJLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsTUFBTSxtQkFBbUIsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQTtnQkFDbkQsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsSUFBSSxDQUFRLENBQUE7Z0JBRTNFLGlFQUFpRTtnQkFDakUsSUFBSSxDQUFDO29CQUNILE1BQU0sVUFBVSxDQUFDLE1BQU0sQ0FBQzt3QkFDdEIsQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7NEJBQ2pCLFVBQVUsRUFBRSxFQUFFO3lCQUNmO3dCQUNELENBQUMsZUFBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFOzRCQUN2QixnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFO3lCQUN6QztxQkFDRixDQUFDLENBQUE7b0JBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSw2QkFBNkIsbUJBQW1CLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQTtnQkFDdEcsQ0FBQztnQkFBQyxPQUFPLFdBQWdCLEVBQUUsQ0FBQztvQkFDMUIsMENBQTBDO29CQUMxQyxJQUFJLFdBQVcsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksV0FBVyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQzt3QkFDcEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsMENBQTBDLENBQUMsQ0FBQTtvQkFDekUsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLE1BQU0sV0FBVyxDQUFBO29CQUNuQixDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sU0FBYyxFQUFFLENBQUM7WUFDeEIsT0FBTyxDQUFDLElBQUksQ0FBQyx5REFBeUQsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDM0YscURBQXFEO1FBQ3ZELENBQUM7UUFFRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQTtJQUM5QyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDaEQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsMkJBQTJCO1lBQ3BDLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQzlELENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDLENBQUE7QUFoRVksUUFBQSxJQUFJLFFBZ0VoQiJ9