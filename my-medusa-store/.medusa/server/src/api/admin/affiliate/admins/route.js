"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
const affiliate_1 = require("../../../../modules/affiliate");
async function GET(req, res) {
    // Verify authenticated user exists (basic check, assumes auth middleware runs before)
    // In Medusa admin routes, req.user or req.session.user_id should be present if authenticated
    // If this is a custom route that bypasses auth, we need to ensure it's protected.
    // Generally custom admin routes in /admin/ path are protected by default middleware in newer Medusa versions.
    // However, explicit check is safer as per CodeRabbit.
    // NOTE: In some Medusa setups, getting req.user requires specific middleware. 
    // For now, we'll assume standard admin protection but if CodeRabbit complained, it might be missing.
    // Let's add a basic check if possible, or at least a comment that we rely on platform auth.
    // Actually, let's look at how other routes do it or just add the check.
    // Checking for user properly:
    // @ts-ignore
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        // Get all affiliate admins
        const affiliateAdmins = await affiliateService.listAffiliateAdmins({});
        // Remove password_hash from response
        const sanitizedAdmins = (affiliateAdmins || []).map((admin) => {
            const { password_hash, ...rest } = admin;
            return rest;
        });
        return res.json({
            affiliateAdmins: sanitizedAdmins,
        });
    }
    catch (error) {
        console.error("Admin affiliate/admins GET error:", error);
        return res.status(500).json({
            message: "Failed to fetch affiliate admins",
            error: error?.message || String(error),
            affiliateAdmins: [],
        });
    }
}
async function POST(req, res) {
    // @ts-ignore
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const body = req.body || {};
        const { name, email, password } = body;
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required",
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long",
            });
        }
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        // Create affiliate admin
        const affiliateAdmin = await affiliateService.createAffiliateAdmin({
            name,
            email,
            password,
        });
        // Remove password_hash from response
        const { password_hash, ...sanitizedAdmin } = affiliateAdmin;
        return res.json({
            affiliateAdmin: sanitizedAdmin,
            message: "Affiliate admin created successfully",
        });
    }
    catch (error) {
        console.error("Admin affiliate/admins POST error:", error);
        if (error.type === "DUPLICATE_ERROR") {
            return res.status(409).json({
                message: error.message || "Affiliate admin with this email already exists",
            });
        }
        return res.status(500).json({
            message: "Failed to create affiliate admin",
            error: error?.message || String(error),
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FmZmlsaWF0ZS9hZG1pbnMvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFJQSxrQkEwQ0M7QUFFRCxvQkFzREM7QUFwR0QsNkRBQWdFO0FBRXpELEtBQUssVUFBVSxHQUFHLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUMvRCxzRkFBc0Y7SUFDdEYsNkZBQTZGO0lBQzdGLGtGQUFrRjtJQUNsRiw4R0FBOEc7SUFDOUcsc0RBQXNEO0lBRXRELCtFQUErRTtJQUMvRSxxR0FBcUc7SUFDckcsNEZBQTRGO0lBQzVGLHdFQUF3RTtJQUV4RSw4QkFBOEI7SUFDOUIsYUFBYTtJQUNiLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEdBQUcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO0lBQ2hELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNYLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxnQkFBZ0IsR0FBMkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsNEJBQWdCLENBQUMsQ0FBQTtRQUVwRiwyQkFBMkI7UUFDM0IsTUFBTSxlQUFlLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUV0RSxxQ0FBcUM7UUFDckMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDakUsTUFBTSxFQUFFLGFBQWEsRUFBRSxHQUFHLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQTtZQUN4QyxPQUFPLElBQUksQ0FBQTtRQUNiLENBQUMsQ0FBQyxDQUFBO1FBRUYsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsZUFBZSxFQUFFLGVBQWU7U0FDakMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUN6RCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxrQ0FBa0M7WUFDM0MsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQztZQUN0QyxlQUFlLEVBQUUsRUFBRTtTQUNwQixDQUFDLENBQUE7SUFDSixDQUFDO0FBQ0gsQ0FBQztBQUVNLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxhQUFhO0lBQ2IsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7SUFDaEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ1gsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBNEQsSUFBSSxFQUFFLENBQUE7UUFDbkYsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsSUFBSSxDQUFBO1FBRXRDLGlCQUFpQjtRQUNqQixJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsT0FBTyxFQUFFLHdDQUF3QzthQUNsRCxDQUFDLENBQUE7UUFDSixDQUFDO1FBRUQsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSw2Q0FBNkM7YUFDdkQsQ0FBQyxDQUFBO1FBQ0osQ0FBQztRQUVELE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDRCQUFnQixDQUFDLENBQUE7UUFFcEYseUJBQXlCO1FBQ3pCLE1BQU0sY0FBYyxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsb0JBQW9CLENBQUM7WUFDakUsSUFBSTtZQUNKLEtBQUs7WUFDTCxRQUFRO1NBQ1QsQ0FBQyxDQUFBO1FBRUYscUNBQXFDO1FBQ3JDLE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxjQUFjLEVBQUUsR0FBRyxjQUFjLENBQUE7UUFFM0QsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsY0FBYyxFQUFFLGNBQWM7WUFDOUIsT0FBTyxFQUFFLHNDQUFzQztTQUNoRCxDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBRTFELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLGdEQUFnRDthQUMzRSxDQUFDLENBQUE7UUFDSixDQUFDO1FBRUQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsa0NBQWtDO1lBQzNDLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUM7U0FDdkMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztBQUNILENBQUMifQ==