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
const lib_storage_1 = require("@aws-sdk/lib-storage");
// CORS headers helper
function setCorsHeaders(res, req) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    const origin = req?.headers?.origin || req?.req?.headers?.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
const OPTIONS = async (req, res) => {
    setCorsHeaders(res, req);
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
// Validate video MIME type
function isValidVideoMimeType(mimeType) {
    const validVideoTypes = [
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/ogg',
        'video/x-matroska',
    ];
    return validVideoTypes.includes(mimeType.toLowerCase());
}
const POST = async (req, res) => {
    setCorsHeaders(res, req);
    // Early return for OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    try {
        console.log("📤 Video upload request received");
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
        let productName = '';
        let collectionName = '';
        const pendingFiles = [];
        const finished = new Promise((resolve, reject) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error("Upload timeout - no files received within 60 seconds"));
                }
            }, 60000); // Longer timeout for videos
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
                // Validate video MIME type
                if (!isValidVideoMimeType(info.mimeType)) {
                    console.error(`❌ Invalid video MIME type: ${info.mimeType}`);
                    file.resume(); // Drain the stream
                    return;
                }
                // Buffer file chunks as they arrive
                const fileChunks = [];
                file.on("data", (chunk) => {
                    fileChunks.push(chunk);
                });
                file.on("end", () => {
                    // Store buffered file data until all fields are parsed
                    pendingFiles.push({
                        buffer: Buffer.concat(fileChunks),
                        info,
                        name,
                    });
                });
                file.on("error", (err) => {
                    console.error("File stream error:", err);
                    // Don't add to pendingFiles if there's an error
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
            bb.on("finish", async () => {
                console.log("Busboy finished parsing. Processing files:", pendingFiles.length);
                busboyFinished = true;
                // Now that all fields are parsed, process files with correct S3 keys
                for (const pendingFile of pendingFiles) {
                    fileCount++;
                    pendingUploads++;
                    const filename = (pendingFile.info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
                    const extension = path.extname(filename) || '.mp4';
                    const uniqueId = (0, node_crypto_1.randomUUID)().substring(0, 8);
                    const videoFilename = `${uniqueId}${extension}`;
                    // Build S3 path based on collection and product name (now we have the fields)
                    let s3Key = '';
                    const currentProductName = productName || '';
                    const currentCollectionName = collectionName || '';
                    if (currentCollectionName && currentProductName) {
                        // product/collection_name/product_name/video/filename
                        s3Key = `product/${sanitizeForPath(currentCollectionName)}/${sanitizeForPath(currentProductName)}/video/${videoFilename}`;
                    }
                    else if (currentProductName) {
                        // product/product_name/video/filename
                        s3Key = `product/${sanitizeForPath(currentProductName)}/video/${videoFilename}`;
                    }
                    else {
                        // Fallback: product/temp/video/filename
                        s3Key = `product/temp/video/${videoFilename}`;
                    }
                    // Upload to S3 using multipart upload (handles large files efficiently)
                    // Note: We buffer the file because we need to wait for fields to be parsed
                    // For very large files, consider using temporary file storage instead
                    try {
                        const upload = new lib_storage_1.Upload({
                            client: s3Client,
                            params: {
                                Bucket: s3Bucket,
                                Key: s3Key,
                                Body: pendingFile.buffer,
                                ContentType: pendingFile.info.mimeType || "video/mp4",
                            },
                        });
                        await upload.done();
                        const fileUrl = `${s3FileUrl}/${s3Key}`;
                        results.push({
                            url: fileUrl,
                            key: s3Key,
                            filename: videoFilename,
                            originalName: filename,
                        });
                        console.log(`✅ Uploaded video to S3: ${s3Key}`);
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
                }
                checkComplete();
            });
        });
        // Try to access raw request stream
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
        console.error("Error in video upload:", error);
        console.error("Error stack:", error?.stack);
        console.error("Error details:", {
            message: error?.message,
            name: error?.name,
            code: error?.code,
        });
        return res.status(500).json({
            message: "Failed to upload videos",
            error: error.message || "Unknown error",
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9wcm9kdWN0cy91cGxvYWQtdmlkZW8vcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsOENBQXFEO0FBQ3JELG9EQUEyQjtBQUMzQiwyQ0FBNEI7QUFDNUIsdUNBQXdCO0FBQ3hCLDZDQUF3QztBQUN4QyxrREFBK0Q7QUFDL0Qsc0RBQTZDO0FBRTdDLHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQixFQUFFLEdBQW1CO0lBQzlELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUE7SUFDM0YsTUFBTSxNQUFNLEdBQUksR0FBVyxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUssR0FBVyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFBO0lBQ2xGLElBQUksTUFBTSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUM5QyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ3RELENBQUM7SUFDRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUN2RSxjQUFjLENBQUMsR0FBRyxFQUFF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