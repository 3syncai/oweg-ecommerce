"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const affiliate_1 = require("../../../../modules/affiliate");
const token_1 = require("../../_lib/token");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    // When using credentials, we must specify the exact origin, not '*'
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
async function POST(req, res) {
    setCorsHeaders(res, req);
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        const body = req.body || {};
        const email = body.email;
        const password = body.password;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        // Get client IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
            req.headers['x-real-ip'] ||
            req.socket?.remoteAddress ||
            null;
        const user = await affiliateService.authenticateAffiliateUser(email, password, ip || undefined);
        const role = user.role || "user";
        // If admin, redirect to admin dashboard
        if (role === "admin") {
            const token = (0, token_1.signAffiliateToken)({
                sub: user.id,
                role: "admin",
                scope: "affiliate"
            });
            const { password_hash, ...sanitizedUser } = user;
            return res.json({
                token,
                user: sanitizedUser,
                role,
                redirectTo: "/admin/dashboard",
            });
        }
        // For regular users, check approval status
        if (role === "user" && !user.is_approved) {
            const token = (0, token_1.signAffiliateToken)({
                sub: user.id,
                role: "user",
                scope: "affiliate"
            });
            const { password_hash, ...sanitizedUser } = user;
            return res.json({
                token,
                user: sanitizedUser,
                role,
                redirectTo: "/verification-pending",
                is_approved: false,
            });
        }
        // User is approved, allow access to dashboard
        const token = (0, token_1.signAffiliateToken)({
            sub: user.id,
            role: "user",
            scope: "affiliate"
        });
        const { password_hash, ...sanitizedUser } = user;
        return res.json({
            token,
            user: sanitizedUser,
            role,
            redirectTo: "/dashboard",
            is_approved: true,
        });
    }
    catch (error) {
        console.error("Affiliate login error:", error);
        return res.status(401).json({
            message: error?.message || "Invalid credentials",
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9hdXRoL2xvZ2luL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZUEsMEJBR0M7QUFFRCxvQkE4RUM7QUFoR0QsNkRBQWdFO0FBQ2hFLDRDQUFxRDtBQUVyRCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUIsRUFBRSxHQUFtQjtJQUM5RCxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUE7SUFDekMsb0VBQW9FO0lBQ3BFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsTUFBTSxDQUFDLENBQUE7SUFDcEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxLQUFLLFVBQVUsT0FBTyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDbkUsY0FBYyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUN4QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDOUIsQ0FBQztBQUVNLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxjQUFjLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBRXhCLElBQUksQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDRCQUFnQixDQUFDLENBQUE7UUFFcEYsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFD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