"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAffiliateToken = signAffiliateToken;
exports.verifyAffiliateToken = verifyAffiliateToken;
const crypto_1 = __importDefault(require("crypto"));
const getSecret = () => process.env.JWT_SECRET || "supersecret";
function signAffiliateToken(payload, ttlSeconds = 60 * 60 * 24) {
    const header = { alg: "HS256", typ: "JWT" };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ttlSeconds;
    const claims = { ...payload, iat, exp };
    const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const headerB64 = base64url(header);
    const claimsB64 = base64url(claims);
    const data = `${headerB64}.${claimsB64}`;
    const sig = crypto_1.default.createHmac("sha256", getSecret()).update(data).digest("base64url");
    return `${data}.${sig}`;
}
function verifyAffiliateToken(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return null;
        const [h, p, s] = parts;
        const data = `${h}.${p}`;
        const expected = crypto_1.default.createHmac("sha256", getSecret()).update(data).digest("base64url");
        const sigBuf = Buffer.from(s);
        const expectedBuf = Buffer.from(expected);
        if (sigBuf.length !== expectedBuf.length || !crypto_1.default.timingSafeEqual(sigBuf, expectedBuf))
            return null;
        const claims = JSON.parse(Buffer.from(p, "base64url").toString());
        if (claims.exp < Math.floor(Date.now() / 1000))
            return null;
        if (claims.scope !== "affiliate")
            return null;
        return claims;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9fbGliL3Rva2VuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBWUEsZ0RBV0M7QUFFRCxvREFtQkM7QUE1Q0Qsb0RBQTJCO0FBRTNCLE1BQU0sU0FBUyxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLGFBQWEsQ0FBQTtBQVUvRCxTQUFnQixrQkFBa0IsQ0FBQyxPQUE2QyxFQUFFLFVBQVUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUU7SUFDekcsTUFBTSxNQUFNLEdBQUcsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQTtJQUMzQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtJQUN6QyxNQUFNLEdBQUcsR0FBRyxHQUFHLEdBQUcsVUFBVSxDQUFBO0lBQzVCLE1BQU0sTUFBTSxHQUFvQixFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQTtJQUN4RCxNQUFNLFNBQVMsR0FBRyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ3pGLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNuQyxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDbkMsTUFBTSxJQUFJLEdBQUcsR0FBRyxTQUFTLElBQUksU0FBUyxFQUFFLENBQUE7SUFDeEMsTUFBTSxHQUFHLEdBQUcsZ0JBQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQTtJQUNyRixPQUFPLEdBQUcsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFBO0FBQ3pCLENBQUM7QUFFRCxTQUFnQixvQkFBb0IsQ0FBQyxLQUFhO0lBQ2hELElBQUksQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDOUIsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQTtRQUNuQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUE7UUFDdkIsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUE7UUFDeEIsTUFBTSxRQUFRLEdBQUcsZ0JBQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUUxRixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQzdCLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDekMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLFdBQVcsQ0FBQyxNQUFNLElBQUksQ0FBQyxnQkFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUE7UUFFckcsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBb0IsQ0FBQTtRQUNwRixJQUFJLE1BQU0sQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUE7UUFDM0QsSUFBSSxNQUFNLENBQUMsS0FBSyxLQUFLLFdBQVc7WUFBRSxPQUFPLElBQUksQ0FBQTtRQUM3QyxPQUFPLE1BQU0sQ0FBQTtJQUNmLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLElBQUksQ0FBQTtJQUNiLENBQUM7QUFDSCxDQUFDIn0=