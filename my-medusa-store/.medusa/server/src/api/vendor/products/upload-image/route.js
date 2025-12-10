"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = exports.OPTIONS = void 0;
const guards_1 = require("../../_lib/guards");
const busboy_1 = __importDefault(require("busboy"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const node_crypto_1 = require("node:crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
const OPTIONS = async (req, res) => {
    setCorsHeaders(res);
    return res.status(200).end();
};
exports.OPTIONS = OPTIONS;
/**
 * Read environment variable from .env file directly (bypasses system env vars)
 */
function readFromEnvFile(key) {
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const lines = envContent.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [envKey, ...valueParts] = trimmed.split('=');
                    if (envKey.trim() === key) {
                        const value = valueParts.join('=').trim();
                        // Remove quotes if present
                        return value.replace(/^["']|["']$/g, '');
                    }
                }
            }
        }
    }
    catch (error) {
        console.error(`Error reading .env file for ${key}:`, error);
    }
    return undefined;
}
function getS3Config() {
    // First try system env vars
    let s3Region = process.env.S3_REGION?.trim();
    let s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    let s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    let s3Bucket = process.env.S3_BUCKET?.trim();
    // If access key looks like a placeholder, read from .env file directly
    if (s3AccessKeyId && (s3AccessKeyId.includes('REPLACE_ME') || s3AccessKeyId.includes('<'))) {
        console.log('⚠️  System env var contains placeholder, reading from .env file...');
        const envFileKey = readFromEnvFile('S3_ACCESS_KEY_ID');
        if (envFileKey && !envFileKey.includes('REPLACE_ME') && !envFileKey.includes('<')) {
            s3AccessKeyId = envFileKey;
            console.log('✅ Using S3_ACCESS_KEY_ID from .env file');
        }
    }
    // Also read other values from .env if they're missing
    if (!s3Region)
        s3Region = readFromEnvFile('S3_REGION');
    if (!s3SecretAccessKey)
        s3SecretAccessKey = readFromEnvFile('S3_SECRET_ACCESS_KEY');
    if (!s3Bucket)
        s3Bucket = readFromEnvFile('S3_BUCKET');
    // If secret key might be placeholder, read from .env
    if (s3SecretAccessKey && (s3SecretAccessKey.includes('REPLACE_ME') || s3SecretAccessKey.includes('<'))) {
        const envFileSecret = readFromEnvFile('S3_SECRET_ACCESS_KEY');
        if (envFileSecret && !envFileSecret.includes('REPLACE_ME') && !envFileSecret.includes('<')) {
            s3SecretAccessKey = envFileSecret;
            console.log('✅ Using S3_SECRET_ACCESS_KEY from .env file');
        }
    }
    return { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket };
}
// Sanitize string for use in file paths
function sanitizeForPath(str) {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'product';
}
const POST = async (req, res) => {
    setCorsHeaders(res);
    // Early return for OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    try {
        console.log("📤 Image upload request received");
        console.log("Request method:", req.method);
        console.log("Request URL:", req.url);
        console.log("Request headers:", Object.keys(req.headers || {}));
        console.log("Content-Type:", req.headers?.["content-type"] || req.headers?.["Content-Type"]);
        // Verify vendor authentication FIRST - before any stream processing
        const vendorId = await (0, guards_1.requireVendorAuth)(req);
        if (!vendorId) {
            console.error("❌ Vendor authentication failed");
            return res.status(401).json({ message: "Unauthorized" });
        }
        console.log("✅ Vendor authenticated:", vendorId);
        // Get S3 configuration
        const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config();
        if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
            return res.status(500).json({
                message: "S3 configuration missing. Please check your .env file."
            });
        }
        // Initialize S3 client
        const s3Client = new client_s3_1.S3Client({
            region: s3Region,
            credentials: {
                accessKeyId: s3AccessKeyId,
                secretAccessKey: s3SecretAccessKey,
            },
        });
        const s3FileUrl = process.env.S3_FILE_URL || `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`;
        const headers = req.headers || {};
        const bb = (0, busboy_1.default)({ headers });
        const results = [];
        let fileCount = 0;
        let pendingUploads = 0;
        let busboyFinished = false;
        // Get product name and collection from form fields
        // These might not be available when files are processed (Busboy processes async)
        // We'll use fallback path if not available
        let productName = '';
        let collectionName = '';
        const finished = new Promise((resolve, reject) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error("Upload timeout - no files received within 30 seconds"));
                }
            }, 30000);
            const checkComplete = () => {
                // Only resolve when both Busboy is finished AND all uploads are complete
                if (busboyFinished && pendingUploads === 0 && !resolved) {
                    console.log("All files processed and uploaded. Total:", results.length);
                    resolved = true;
                    clearTimeout(timeout);
                    resolve();
                }
            };
            bb.on("file", (name, file, info) => {
                console.log("File received:", name, info.filename, info.mimeType);
                fileCount++;
                pendingUploads++;
                const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
                const extension = path.extname(filename) || '.png';
                const uniqueId = (0, node_crypto_1.randomUUID)().substring(0, 8);
                const imageFilename = `${uniqueId}${extension}`;
                // Build S3 path based on collection and product name
                // Note: Fields might not be available yet (Busboy processes async)
                // We'll use current values or fallback path
                let s3Key = '';
                const currentProductName = productName || '';
                const currentCollectionName = collectionName || '';
                if (currentCollectionName && currentProductName) {
                    // product/collection_name/product_name/img/filename
                    s3Key = `product/${sanitizeForPath(currentCollectionName)}/${sanitizeForPath(currentProductName)}/img/${imageFilename}`;
                }
                else if (currentProductName) {
                    // product/product_name/img/filename
                    s3Key = `product/${sanitizeForPath(currentProductName)}/img/${imageFilename}`;
                }
                else {
                    // Fallback: product/temp/img/filename (will be used if fields come after files)
                    s3Key = `product/temp/img/${imageFilename}`;
                }
                // Read file into buffer
                const fileChunks = [];
                file.on("data", (chunk) => {
                    fileChunks.push(chunk);
                });
                file.on("end", async () => {
                    try {
                        const fileBuffer = Buffer.concat(fileChunks);
                        // Upload to S3
                        const command = new client_s3_1.PutObjectCommand({
                            Bucket: s3Bucket,
                            Key: s3Key,
                            Body: fileBuffer,
                            ContentType: info.mimeType || "image/png",
                        });
                        await s3Client.send(command);
                        const fileUrl = `${s3FileUrl}/${s3Key}`;
                        results.push({
                            url: fileUrl,
                            key: s3Key,
                            filename: imageFilename,
                            originalName: filename,
                        });
                        console.log(`✅ Uploaded to S3: ${s3Key}`);
                        pendingUploads--;
                        checkComplete();
                    }
                    catch (uploadError) {
                        console.error("S3 upload error:", uploadError);
                        pendingUploads--;
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            reject(uploadError);
                        }
                    }
                });
                file.on("error", (err) => {
                    console.error("File stream error:", err);
                    pendingUploads--;
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(err);
                    }
                });
            });
            bb.on("field", (name, value) => {
                console.log("Field received:", name, value);
                if (name === "productName" || name === "product_name") {
                    productName = value || '';
                }
                else if (name === "collectionName" || name === "collection_name") {
                    collectionName = value || '';
                }
            });
            bb.on("error", (error) => {
                console.error("Busboy error:", error);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            bb.on("finish", () => {
                console.log("Busboy finished parsing. Files received:", fileCount, "Pending uploads:", pendingUploads);
                busboyFinished = true;
                checkComplete();
            });
        });
        // Try to access raw request stream
        // In Medusa v2, the request might be wrapped, so we need to access the underlying stream
        let rawReq = null;
        console.log("🔍 Checking request stream access...");
        console.log("req.raw exists:", !!req.raw);
        console.log("req.req exists:", !!req.req);
        console.log("req.pipe exists:", typeof req.pipe === "function");
        console.log("req.readable exists:", typeof req.readable !== "undefined");
        // Try multiple paths to find the raw request stream
        const possiblePaths = [
            () => req.raw,
            () => req.req,
            () => req.request,
            () => req.socket?.request,
            () => req,
        ];
        for (const getPath of possiblePaths) {
            try {
                const candidate = getPath();
                if (candidate && typeof candidate.pipe === "function") {
                    // Check if stream is readable
                    if (candidate.readable !== false && candidate.readableEnded !== true) {
                        rawReq = candidate;
                        console.log("✅ Found readable stream");
                        break;
                    }
                    else {
                        console.log("⚠️ Stream found but already consumed");
                    }
                }
            }
            catch (e) {
                // Continue to next path
            }
        }
        if (!rawReq) {
            console.error("❌ No readable stream found");
            console.error("Request structure:", {
                hasRaw: !!req.raw,
                hasReq: !!req.req,
                hasPipe: typeof req.pipe === "function",
                keys: Object.keys(req || {}).slice(0, 10),
            });
            return res.status(400).json({
                message: "Request stream not available",
                details: "Cannot access request body stream. This might be a Medusa v2 routing issue.",
                suggestion: "Check if the route path is correct and if Medusa is parsing the body before our handler."
            });
        }
        try {
            console.log("📥 Piping request to busboy...");
            rawReq.pipe(bb);
        }
        catch (pipeError) {
            console.error("❌ Error piping request to busboy:", pipeError);
            console.error("Pipe error details:", {
                message: pipeError?.message,
                stack: pipeError?.stack,
            });
            return res.status(400).json({
                message: "Failed to process request stream",
                error: pipeError?.message || "Unknown pipe error"
            });
        }
        await finished;
        if (!results.length) {
            return res.status(400).json({ message: "no files received" });
        }
        return res.json({ files: results });
    }
    catch (error) {
        console.error("Error in image upload:", error);
        console.error("Error stack:", error?.stack);
        console.error("Error details:", {
            message: error?.message,
            name: error?.name,
            code: error?.code,
        });
        return res.status(500).json({
            message: "Failed to upload images",
            error: error.message || "Unknown error",
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9wcm9kdWN0cy91cGxvYWQtaW1hZ2Uvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsOENBQXFEO0FBQ3JELG9EQUEyQjtBQUMzQiwyQ0FBNEI7QUFDNUIsdUNBQXdCO0FBQ3hCLDZDQUF3QztBQUN4QyxrREFBK0Q7QUFFL0Qsc0JBQXNCO0FBQ3RCLFNBQVMsY0FBYyxDQUFDLEdBQW1CO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDakQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBa0IsRUFBRSxHQUFtQixFQUFFLEVBQUU7SUFDdkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtBQUM5QixDQUFDLENBQUE7QUFIWSxRQUFBLE9BQU8sV0FHbkI7QUFFRDs7R0FFRztBQUNILFNBQVMsZUFBZSxDQUFDLEdBQVc7SUFDbEMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDaEQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENB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