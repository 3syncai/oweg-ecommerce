"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = ensureDir;
exports.nowIso = nowIso;
exports.writeJson = writeJson;
exports.readJson = readJson;
exports.sha256File = sha256File;
exports.safeFilename = safeFilename;
exports.appendLog = appendLog;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
async function ensureDir(dirPath) {
    await (0, promises_1.mkdir)(dirPath, { recursive: true });
}
function nowIso() {
    return new Date().toISOString();
}
async function writeJson(filePath, data, pretty = true) {
    await ensureDir(path_1.default.dirname(filePath));
    await (0, promises_1.writeFile)(filePath, JSON.stringify(data, null, pretty ? 2 : undefined), "utf8");
}
async function readJson(filePath) {
    try {
        const raw = await (0, promises_1.readFile)(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}
async function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto_1.default.createHash("sha256");
        const stream = fs_1.default.createReadStream(filePath);
        stream.on("error", (error) => reject(error));
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}
function safeFilename(input) {
    return input.replace(/[^a-z0-9._-]+/gi, "_");
}
async function appendLog(filePath, logEntry) {
    await ensureDir(path_1.default.dirname(filePath));
    await fs_1.default.promises.appendFile(filePath, `${JSON.stringify({ timestamp: nowIso(), ...logEntry })}\n`, "utf8");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZXRsL3V0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBS0EsOEJBRUM7QUFFRCx3QkFFQztBQUVELDhCQVdDO0FBRUQsNEJBVUM7QUFFRCxnQ0FRQztBQUVELG9DQUVDO0FBRUQsOEJBVUM7QUE5REQsb0RBQTRCO0FBQzVCLDRDQUFvQjtBQUNwQiwwQ0FBeUQ7QUFDekQsZ0RBQXdCO0FBRWpCLEtBQUssVUFBVSxTQUFTLENBQUMsT0FBZTtJQUM3QyxNQUFNLElBQUEsZ0JBQUssRUFBQyxPQUFPLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUM1QyxDQUFDO0FBRUQsU0FBZ0IsTUFBTTtJQUNwQixPQUFPLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDbEMsQ0FBQztBQUVNLEtBQUssVUFBVSxTQUFTLENBQzdCLFFBQWdCLEVBQ2hCLElBQWEsRUFDYixNQUFNLEdBQUcsSUFBSTtJQUViLE1BQU0sU0FBUyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN4QyxNQUFNLElBQUEsb0JBQVMsRUFDYixRQUFRLEVBQ1IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFDbEQsTUFBTSxDQUNQLENBQUM7QUFDSixDQUFDO0FBRU0sS0FBSyxVQUFVLFFBQVEsQ0FBSSxRQUFnQjtJQUNoRCxJQUFJLENBQUM7UUFDSCxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUEsbUJBQVEsRUFBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBTSxDQUFDO0lBQzlCLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLElBQUksS0FBSyxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM3QixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRU0sS0FBSyxVQUFVLFVBQVUsQ0FBQyxRQUFnQjtJQUMvQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3JDLE1BQU0sSUFBSSxHQUFHLGdCQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLFlBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsU0FBZ0IsWUFBWSxDQUFDLEtBQWE7SUFDeEMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFTSxLQUFLLFVBQVUsU0FBUyxDQUM3QixRQUFnQixFQUNoQixRQUFpQztJQUVqQyxNQUFNLFNBQVMsQ0FBQyxjQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDeEMsTUFBTSxZQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FDMUIsUUFBUSxFQUNSLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsRUFBRSxHQUFHLFFBQVEsRUFBRSxDQUFDLElBQUksRUFDM0QsTUFBTSxDQUNQLENBQUM7QUFDSixDQUFDIn0=