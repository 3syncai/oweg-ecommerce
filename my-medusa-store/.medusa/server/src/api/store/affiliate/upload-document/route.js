"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const client_s3_1 = require("@aws-sdk/client-s3");
const busboy_1 = __importDefault(require("busboy"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    // When using credentials, we must specify the exact origin, not '*'
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
function getS3Config() {
    return {
        s3Region: process.env.S3_REGION?.trim() || "",
        s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
        s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
        s3Bucket: process.env.S3_BUCKET?.trim() || "",
    };
}
// Sanitize string for use in file paths
function sanitizeForPath(str) {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'user';
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
async function POST(req, res) {
    setCorsHeaders(res, req);
    try {
        // Get S3 configuration
        const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config();
        if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
            return res.status(500).json({
                message: "S3 configuration missing. Please check your .env file.",
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
        let userName = '';
        let userEmail = '';
        const finished = new Promise((resolve, reject) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error("Upload timeout - no files received within 30 seconds"));
                }
            }, 30000);
            const checkComplete = () => {
                if (busboyFinished && pendingUploads === 0 && !resolved) {
                    console.log("All files processed and uploaded. Total:", results.length);
                    resolved = true;
                    clearTimeout(timeout);
                    resolve();
                }
            };
            // Handle form fields
            bb.on("field", (name, value) => {
                if (name === "userName") {
                    userName = value;
                }
                else if (name === "userEmail") {
                    userEmail = value;
                }
            });
            bb.on("file", (name, file, info) => {
                console.log("File received:", name, info.filename, info.mimeType);
                fileCount++;
                pendingUploads++;
                const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
                const extension = path_1.default.extname(filename) || '.png';
                const uniqueId = (0, crypto_1.randomUUID)().substring(0, 8);
                const imageFilename = `${uniqueId}${extension}`;
                // Build S3 path: affiliate/users/{userName}/documents/{fieldName}/{filename}
                const sanitizedName = sanitizeForPath(userName || userEmail || "user");
                const fieldName = name || "document";
                const s3Key = `affiliate/users/${sanitizedName}/documents/${fieldName}/${imageFilename}`;
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
                            fieldName: fieldName,
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
            bb.on("finish", () => {
                console.log("Busboy finished. Files received:", fileCount);
                busboyFinished = true;
                checkComplete();
            });
            bb.on("error", (err) => {
                console.error("Busboy error:", err);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(err);
                }
            });
            req.pipe(bb);
        });
        await finished;
        return res.json({
            files: results,
            message: `Successfully uploaded ${results.length} file(s)`,
        });
    }
    catch (error) {
        console.error("Document upload error:", error);
        return res.status(500).json({
            message: "Failed to upload documents",
            error: error?.message || String(error),
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2FmZmlsaWF0ZS91cGxvYWQtZG9jdW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFtQ0EsMEJBR0M7QUFFRCxvQkFrS0M7QUF6TUQsa0RBQStEO0FBQy9ELG9EQUEyQjtBQUMzQixnREFBdUI7QUFDdkIsbUNBQW1DO0FBRW5DLHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQixFQUFFLEdBQW1CO0lBQzlELE1BQU0sTUFBTSxHQUFHLEdBQUcsRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQTtJQUN6QyxvRUFBb0U7SUFDcEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVELFNBQVMsV0FBVztJQUNsQixPQUFPO1FBQ0wsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7UUFDN0MsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtRQUN6RCxpQkFBaUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7UUFDakUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7S0FDOUMsQ0FBQTtBQUNILENB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