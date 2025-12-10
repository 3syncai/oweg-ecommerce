"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const vendor_1 = require("../../../../modules/vendor");
async function POST(req, res) {
    try {
        const vendorService = req.scope.resolve(vendor_1.VENDOR_MODULE);
        const body = req.body || {};
        const oldPassword = body.old_password || "";
        const newPassword = body.new_password || "";
        if (!oldPassword || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: "Invalid password payload" });
        }
        const user = req.user;
        if (!user?.id) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // re-authenticate using current credentials
        const current = await vendorService.retrieveVendorUser(user.id).catch(() => null);
        if (!current)
            return res.status(404).json({ message: "User not found" });
        // verify old password
        await vendorService.authenticateVendorUser(current.email, oldPassword);
        // set new password & clear must_reset flag
        const bcrypt = await import("bcryptjs");
        const password_hash = await bcrypt.hash(newPassword, 10);
        await vendorService.updateVendorUsers({
            id: current.id,
            password_hash,
            last_login_at: new Date(),
            must_reset_password: false,
        });
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(400).json({ message: e?.message || "Unable to change password" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9hdXRoL2NoYW5nZS1wYXNzd29yZC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUlBLG9CQStCQztBQWpDRCx1REFBMEQ7QUFFbkQsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLElBQUksQ0FBQztRQUNILE1BQU0sYUFBYSxHQUF3QixHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxzQkFBYSxDQUFDLENBQUE7UUFDM0UsTUFBTSxJQUFJLEdBQUksR0FBVyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUE7UUFDcEMsTUFBTSxXQUFXLEdBQVcsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUE7UUFDbkQsTUFBTSxXQUFXLEdBQVcsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUE7UUFDbkQsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLFdBQVcsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzNELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFBO1FBQ3RFLENBQUM7UUFDRCxNQUFNLElBQUksR0FBSSxHQUFXLENBQUMsSUFBSSxDQUFBO1FBQzlCLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDZCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUE7UUFDMUQsQ0FBQztRQUNELDRDQUE0QztRQUM1QyxNQUFNLE9BQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2pGLElBQUksQ0FBQyxPQUFPO1lBQUUsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUE7UUFDeEUsc0JBQXNCO1FBQ3RCLE1BQU0sYUFBYSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUE7UUFDdEUsMkNBQTJDO1FBQzNDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFBO1FBQ3ZDLE1BQU0sYUFBYSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUE7UUFDeEQsTUFBTSxhQUFhLENBQUMsaUJBQWlCLENBQUM7WUFDcEMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFO1lBQ2QsYUFBYTtZQUNiLGFBQWEsRUFBRSxJQUFJLElBQUksRUFBRTtZQUN6QixtQkFBbUIsRUFBRSxLQUFLO1NBQzNCLENBQUMsQ0FBQTtRQUNGLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBQy9CLENBQUM7SUFBQyxPQUFPLENBQU0sRUFBRSxDQUFDO1FBQ2hCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sSUFBSSwyQkFBMkIsRUFBRSxDQUFDLENBQUE7SUFDckYsQ0FBQztBQUNILENBQUMifQ==