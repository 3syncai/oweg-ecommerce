"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
exports.PUT = PUT;
exports.DELETE = DELETE;
const guards_1 = require("../../_lib/guards");
const utils_1 = require("@medusajs/framework/utils");
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res);
    return res.status(200).end();
}
async function GET(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    const productId = req.params?.id;
    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
    }
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const product = await productModuleService.retrieveProduct(productId);
        // Verify product belongs to vendor
        const metadata = product.metadata || {};
        if (metadata.vendor_id !== auth.vendor_id) {
            return res.status(403).json({ message: "Product does not belong to this vendor" });
        }
        return res.json({ product });
    }
    catch (error) {
        console.error("Vendor product retrieve error:", error);
        return res.status(500).json({ message: error?.message || "Failed to retrieve product" });
    }
}
async function PUT(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    const productId = req.params?.id;
    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
    }
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const product = await productModuleService.retrieveProduct(productId);
        // Verify product belongs to vendor
        const metadata = product.metadata || {};
        if (metadata.vendor_id !== auth.vendor_id) {
            return res.status(403).json({ message: "Product does not belong to this vendor" });
        }
        const body = req.body || {};
        const { title, description, handle, category_ids, images, status, weight, } = body;
        // Update product using product service directly
        const updateData = {};
        if (title)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (handle !== undefined)
            updateData.handle = handle;
        if (category_ids)
            updateData.category_ids = category_ids;
        if (images)
            updateData.images = images;
        if (status)
            updateData.status = status;
        if (weight !== undefined)
            updateData.weight = weight;
        // Preserve vendor_id in metadata
        updateData.metadata = {
            ...metadata,
            vendor_id: auth.vendor_id,
        };
        const updatedProduct = await productModuleService.updateProducts(productId, updateData);
        return res.json({ product: updatedProduct });
    }
    catch (error) {
        console.error("Vendor product update error:", error);
        return res.status(500).json({ message: error?.message || "Failed to update product" });
    }
}
async function DELETE(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    const productId = req.params?.id;
    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
    }
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const product = await productModuleService.retrieveProduct(productId);
        // Verify product belongs to vendor
        const metadata = product.metadata || {};
        if (metadata.vendor_id !== auth.vendor_id) {
            return res.status(403).json({ message: "Product does not belong to this vendor" });
        }
        // Delete product (soft delete via status change or hard delete)
        await productModuleService.deleteProducts([productId]);
        return res.json({ message: "Product deleted successfully" });
    }
    catch (error) {
        console.error("Vendor product delete error:", error);
        return res.status(500).json({ message: error?.message || "Failed to delete product" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9wcm9kdWN0cy9baWRdL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsMEJBR0M7QUFFRCxrQkF5QkM7QUFFRCxrQkFzREM7QUFFRCx3QkE0QkM7QUEvSEQsOENBQXlEO0FBQ3pELHFEQUFtRDtBQUVuRCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUI7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLEtBQUssVUFBVSxPQUFPLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNuRSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQzlCLENBQUM7QUFFTSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBQSw4QkFBcUIsRUFBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDbEQsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFNO0lBRWpCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBWSxDQUFBO0lBQzFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNmLE9BQU8sR0FBRyxD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