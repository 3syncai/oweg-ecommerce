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
        const { id: productId } = req.params;
        if (!productId) {
            return res.status(400).json({ message: "Product ID is required" });
        }
        console.log("📤 Review media upload request received for product:", productId);
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
        // Get product name from form fields
        let productName = '';
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
                // Build S3 path: reviews/productname/img.png
                const currentProductName = productName || 'product';
                const sanitizedProductName = sanitizeForPath(currentProductName);
                const s3Key = `reviews/${sanitizedProductName}/${imageFilename}`;
                // Read file into buffer
                const fileChunks = [];
                file.on("data", (chunk) => {
                    fileChunks.push(chunk);
                });
                file.on("end", async () => {
                    try {
                        const fileBuffer = Buffer.concat(fileChunks);
                        // Determine content type
                        let contentType = info.mimeType || "image/png";
                        if (extension.match(/\.(jpg|jpeg)$/i)) {
                            contentType = "image/jpeg";
                        }
                        else if (extension.match(/\.png$/i)) {
                            contentType = "image/png";
                        }
                        else if (extension.match(/\.gif$/i)) {
                            contentType = "image/gif";
                        }
                        else if (extension.match(/\.webp$/i)) {
                            contentType = "image/webp";
                        }
                        else if (extension.match(/\.(mp4|mpeg4)$/i)) {
                            contentType = "video/mp4";
                        }
                        else if (extension.match(/\.mov$/i)) {
                            contentType = "video/quicktime";
                        }
                        else if (extension.match(/\.avi$/i)) {
                            contentType = "video/x-msvideo";
                        }
                        else if (extension.match(/\.webm$/i)) {
                            contentType = "video/webm";
                        }
                        else if (extension.match(/\.mkv$/i)) {
                            contentType = "video/x-matroska";
                        }
                        else if (info.mimeType?.startsWith('video/')) {
                            contentType = info.mimeType;
                        }
                        else if (info.mimeType?.startsWith('image/')) {
                            contentType = info.mimeType;
                        }
                        // Upload to S3
                        const command = new client_s3_1.PutObjectCommand({
                            Bucket: s3Bucket,
                            Key: s3Key,
                            Body: fileBuffer,
                            ContentType: contentType,
                        });
                        await s3Client.send(command);
                        const fileUrl = `${s3FileUrl}/${s3Key}`;
                        results.push({
                            url: fileUrl,
                            key: s3Key,
                            filename: imageFilename,
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
        let rawReq = null;
        console.log("🔍 Checking request stream access...");
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
            return res.status(400).json({
                message: "Request stream not available",
                details: "Cannot access request body stream. This might be a Medusa v2 routing issue.",
            });
        }
        try {
            console.log("📥 Piping request to busboy...");
            rawReq.pipe(bb);
        }
        catch (pipeError) {
            console.error("❌ Error piping request to busboy:", pipeError);
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
        console.error("Error in review media upload:", error);
        return res.status(500).json({
            message: "Failed to upload media",
            error: error.message || "Unknown error",
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3Byb2R1Y3RzL1tpZF0vcmV2aWV3cy91cGxvYWQtbWVkaWEvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0Esb0RBQTJCO0FBQzNCLDJDQUE0QjtBQUM1Qix1Q0FBd0I7QUFDeEIsNkNBQXdDO0FBQ3hDLGtEQUErRDtBQUUvRCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUI7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUN2RSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQzlCLENBQUMsQ0FBQTtBQUhZLFFBQUEsT0FBTyxXQUduQjtBQUVEOztHQUVHO0FBQ0gsU0FBUyxlQUFlLENBQUMsR0FBVztJQUNsQyxJQUFJLENBQUM7UUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNoRCxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVB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