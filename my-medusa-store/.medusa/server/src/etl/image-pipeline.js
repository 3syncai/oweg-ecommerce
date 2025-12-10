"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImagePipeline = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = require("stream/promises");
const stream_1 = require("stream");
const util_1 = require("util");
const axios_1 = __importDefault(require("axios"));
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("./config");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const s3_keys_1 = require("./s3-keys");
const finishedAsync = (0, util_1.promisify)(stream_1.finished);
class ImagePipeline {
    constructor(jobId, context) {
        this.jobId = jobId;
        this.http = axios_1.default.create({
            timeout: 30000,
            validateStatus: (status) => status >= 200 && status < 500,
        });
        this.s3Client = null;
        this.seenChecksums = new Map();
        this.brandName = context?.brandName;
        this.productName = context?.productName;
        this.productId = context?.productId;
    }
    /**
     * Update the product context for this pipeline
     */
    setProductContext(context) {
        this.brandName = context.brandName;
        this.productName = context.productName;
        this.productId = context.productId;
    }
    async ensureS3() {
        if (this.s3Client) {
            return this.s3Client;
        }
        const region = process.env.AWS_REGION ||
            process.env.OBJECT_STORAGE_REGION ||
            "us-east-1";
        this.s3Client = new client_s3_1.S3Client({
            region,
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });
        return this.s3Client;
    }
    normalizeFilename(sourceTable, sourceId, ext = "") {
        const base = `${(0, utils_1.safeFilename)(sourceTable)}_${(0, utils_1.safeFilename)(sourceId)}`;
        return `${base}${ext ? `.${ext}` : ""}`;
    }
    async processImage(sourceTable, sourceId, imageUrl) {
        const lower = imageUrl.toLowerCase();
        if (!lower.startsWith("http")) {
            return {
                sourcePath: imageUrl,
                checksum: "",
                objectUrl: null,
                status: "failed",
                error: "Unsupported image URL",
            };
        }
        try {
            const response = await this.http.get(imageUrl, {
                responseType: "stream",
                maxContentLength: 50 * 1024 * 1024,
            });
            if (response.status >= 400) {
                return {
                    sourcePath: imageUrl,
                    checksum: "",
                    objectUrl: null,
                    status: "failed",
                    error: `HTTP ${response.status}`,
                };
            }
            const tmpDir = path_1.default.join(config_1.config.paths.dataDir, this.jobId, "tmp");
            await (0, utils_1.ensureDir)(tmpDir);
            const extMatch = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(imageUrl);
            const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
            const fileName = this.normalizeFilename(sourceTable, sourceId, ext);
            const tmpPath = path_1.default.join(tmpDir, fileName);
            const writeStream = (0, fs_1.createWriteStream)(tmpPath);
            const hash = crypto_1.default.createHash("sha256");
            response.data.on("data", (chunk) => hash.update(chunk));
            await (0, promises_1.pipeline)(response.data, writeStream);
            await finishedAsync(writeStream);
            const checksum = hash.digest("hex");
            if (this.seenChecksums.has(checksum)) {
                await logger_1.logger.info({
                    jobId: this.jobId,
                    step: "image",
                    message: `Deduplicated image ${imageUrl}`,
                });
                await fs_1.promises.unlink(tmpPath);
                return {
                    sourcePath: imageUrl,
                    checksum,
                    objectUrl: this.seenChecksums.get(checksum) ?? null,
                    status: "skipped",
                };
            }
            if (!config_1.config.storage.bucket) {
                return {
                    sourcePath: imageUrl,
                    checksum,
                    objectUrl: tmpPath,
                    status: "skipped",
                    error: "OBJECT_STORAGE_BUCKET not configured; retained local copy",
                };
            }
            const client = await this.ensureS3();
            // Use structured key if we have product context, otherwise use legacy format
            const objectKey = this.productName && this.productId
                ? (0, s3_keys_1.buildBrandProductImageKey)({
                    brandName: this.brandName,
                    productName: this.productName,
                    productId: this.productId,
                    originalName: imageUrl,
                })
                : `${config_1.config.storage.basePath || "opencart"}/${fileName}`;
            const upload = new client_s3_1.PutObjectCommand({
                Bucket: config_1.config.storage.bucket,
                Key: objectKey,
                Body: await fs_1.promises.readFile(tmpPath),
                ContentType: response.headers["content-type"] ?? "application/octet-stream",
                CacheControl: "public,max-age=31536000,immutable",
            });
            await client.send(upload);
            const region = process.env.AWS_REGION ||
                process.env.OBJECT_STORAGE_REGION ||
                "us-east-1";
            const objectUrl = `https://${config_1.config.storage.bucket}.s3.${region}.amazonaws.com/${objectKey}`;
            this.seenChecksums.set(checksum, objectUrl);
            await fs_1.promises.unlink(tmpPath);
            return {
                sourcePath: imageUrl,
                checksum,
                objectUrl,
                status: "uploaded",
            };
        }
        catch (error) {
            return {
                sourcePath: imageUrl,
                checksum: "",
                objectUrl: null,
                status: "failed",
                error: error?.message ?? String(error),
            };
        }
    }
}
exports.ImagePipeline = ImagePipeline;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UtcGlwZWxpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZXRsL2ltYWdlLXBpcGVsaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLDJCQUErRDtBQUMvRCxnREFBd0I7QUFDeEIsb0RBQTRCO0FBQzVCLDhDQUEyQztBQUMzQyxtQ0FBa0M7QUFDbEMsK0JBQWlDO0FBQ2pDLGtEQUE2QztBQUM3QyxrREFBZ0U7QUFDaEUscUNBQWtDO0FBQ2xDLHFDQUFrQztBQUNsQyxtQ0FBa0Q7QUFDbEQsdUNBQXNEO0FBRXRELE1BQU0sYUFBYSxHQUFHLElBQUEsZ0JBQVMsRUFBQyxpQkFBUSxDQUFDLENBQUM7QUFnQjFDLE1BQWEsYUFBYTtJQVd4QixZQUFvQixLQUFhLEVBQUUsT0FBOEI7UUFBN0MsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUMvQixJQUFJLENBQUMsSUFBSSxHQUFHLGVBQUssQ0FBQyxNQUFNLENBQUM7WUFDdkIsT0FBTyxFQUFFLEtBQUs7WUFDZCxjQUFjLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUc7U0FDMUQsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDckIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxFQUFFLFNBQVMsQ0FBQztRQUNwQyxJQUFJLENBQUMsV0FBVyxHQUFHLE9BQU8sRUFBRSxXQUFXLENBQUM7UUFDeEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLEVBQUUsU0FBUyxDQUFDO0lBQ3RDLENBQUM7SUFFRDs7T0FFRztJQUNILGlCQUFpQixDQUFDLE9BQTZCO1FBQzdDLElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUNuQyxJQUFJLENBQUMs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