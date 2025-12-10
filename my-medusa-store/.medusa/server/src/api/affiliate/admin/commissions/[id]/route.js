"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.PUT = PUT;
exports.DELETE = DELETE;
const affiliate_1 = require("../../../../../modules/affiliate");
const token_1 = require("../../../_lib/token");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { isValid: false };
        }
        const token = authHeader.substring(7);
        const claims = (0, token_1.verifyAffiliateToken)(token);
        if (!claims || claims.role !== "admin") {
            return { isValid: false };
        }
        return { isValid: true, adminId: claims.sub };
    }
    catch (error) {
        return { isValid: false };
    }
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
// PUT - Update commission
async function PUT(req, res) {
    setCorsHeaders(res, req);
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        const commissionId = req.params?.id;
        if (!commissionId) {
            return res.status(400).json({
                message: "Commission ID is required",
            });
        }
        const body = req.body;
        const commission = await affiliateService.updateCommission(commissionId, {
            commission_rate: body.commission_rate !== undefined ? Number(body.commission_rate) : undefined,
            metadata: body.metadata,
        });
        return res.json({
            message: "Commission updated successfully",
            commission,
        });
    }
    catch (error) {
        console.error("Update commission error:", error);
        if (error.type === "NOT_FOUND") {
            return res.status(404).json({
                message: error.message || "Commission not found",
            });
        }
        if (error.type === "INVALID_DATA") {
            return res.status(400).json({
                message: error.message || "Invalid commission data",
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to update commission",
        });
    }
}
// DELETE - Delete commission
async function DELETE(req, res) {
    setCorsHeaders(res, req);
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        const commissionId = req.params?.id;
        if (!commissionId) {
            return res.status(400).json({
                message: "Commission ID is required",
            });
        }
        await affiliateService.deleteCommission(commissionId);
        return res.json({
            message: "Commission deleted successfully",
        });
    }
    catch (error) {
        console.error("Delete commission error:", error);
        if (error.type === "NOT_FOUND") {
            return res.status(404).json({
                message: error.message || "Commission not found",
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to delete commission",
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9hZG1pbi9jb21taXNzaW9ucy9baWRdL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUNBLDBCQUdDO0FBR0Qsa0JBa0RDO0FBR0Qsd0JBb0NDO0FBaElELGdFQUFtRTtBQUNuRSwrQ0FBMEQ7QUFFMUQsc0JBQXNCO0FBQ3RCLFNBQVMsY0FBYyxDQUFDLEdBQW1CLEVBQUUsR0FBbUI7SUFDOUQsTUFBTSxNQUFNLEdBQUcsR0FBRyxFQUFFLE9BQU8sQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFBO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsTUFBTSxDQUFDLENBQUE7SUFDcEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFRCwrQkFBK0I7QUFDL0IsS0FBSyxVQUFVLDBCQUEwQixDQUFDLEdBQWtCO0lBQzFELElBQUksQ0FBQztRQUNILE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFBO1FBQzVDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQTtRQUMzQixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNyQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDRCQUFvQixFQUFDLEtBQUssQ0FBQyxD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