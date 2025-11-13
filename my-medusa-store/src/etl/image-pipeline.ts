import { createWriteStream, promises as fsPromises } from "fs";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { finished } from "stream";
import { promisify } from "util";
import axios, { AxiosInstance } from "axios";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config";
import { logger } from "./logger";
import { ensureDir, safeFilename } from "./utils";
import { buildBrandProductImageKey } from "./s3-keys";

const finishedAsync = promisify(finished);

export interface ProcessResult {
  sourcePath: string;
  checksum: string;
  objectUrl: string | null;
  status: "uploaded" | "skipped" | "failed";
  error?: string;
}

export interface ImagePipelineContext {
  brandName?: string | null;
  productName?: string;
  productId?: number;
}

export class ImagePipeline {
  private http: AxiosInstance;

  private s3Client: S3Client | null;

  private seenChecksums: Map<string, string>;

  private brandName?: string | null;
  private productName?: string;
  private productId?: number;

  constructor(private jobId: string, context?: ImagePipelineContext) {
    this.http = axios.create({
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
  setProductContext(context: ImagePipelineContext): void {
    this.brandName = context.brandName;
    this.productName = context.productName;
    this.productId = context.productId;
  }

  private async ensureS3(): Promise<S3Client> {
    if (this.s3Client) {
      return this.s3Client;
    }
    const region =
      process.env.AWS_REGION ||
      process.env.OBJECT_STORAGE_REGION ||
      "us-east-1";
    this.s3Client = new S3Client({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    return this.s3Client;
  }

  private normalizeFilename(sourceTable: string, sourceId: string, ext = "") {
    const base = `${safeFilename(sourceTable)}_${safeFilename(sourceId)}`;
    return `${base}${ext ? `.${ext}` : ""}`;
  }

  async processImage(
    sourceTable: string,
    sourceId: string,
    imageUrl: string
  ): Promise<ProcessResult> {
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

      const tmpDir = path.join(config.paths.dataDir, this.jobId, "tmp");
      await ensureDir(tmpDir);
      const extMatch = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(imageUrl);
      const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const fileName = this.normalizeFilename(sourceTable, sourceId, ext);
      const tmpPath = path.join(tmpDir, fileName);
      const writeStream = createWriteStream(tmpPath);
      const hash = crypto.createHash("sha256");

      response.data.on("data", (chunk: Buffer) => hash.update(chunk));

      await pipeline(response.data, writeStream);
      await finishedAsync(writeStream);

      const checksum = hash.digest("hex");
      if (this.seenChecksums.has(checksum)) {
        await logger.info({
          jobId: this.jobId,
          step: "image",
          message: `Deduplicated image ${imageUrl}`,
        });
        await fsPromises.unlink(tmpPath);
        return {
          sourcePath: imageUrl,
          checksum,
          objectUrl: this.seenChecksums.get(checksum) ?? null,
          status: "skipped",
        };
      }

      if (!config.storage.bucket) {
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
      const objectKey =
        this.productName && this.productId
          ? buildBrandProductImageKey({
              brandName: this.brandName,
              productName: this.productName,
              productId: this.productId,
              originalName: imageUrl,
            })
          : `${config.storage.basePath || "opencart"}/${fileName}`;

      const upload = new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
        Body: await fsPromises.readFile(tmpPath),
        ContentType:
          response.headers["content-type"] ?? "application/octet-stream",
        CacheControl: "public,max-age=31536000,immutable",
      });
      await client.send(upload);
      const region =
        process.env.AWS_REGION ||
        process.env.OBJECT_STORAGE_REGION ||
        "us-east-1";
      const objectUrl = `https://${config.storage.bucket}.s3.${region}.amazonaws.com/${objectKey}`;
      this.seenChecksums.set(checksum, objectUrl);
      await fsPromises.unlink(tmpPath);
      return {
        sourcePath: imageUrl,
        checksum,
        objectUrl,
        status: "uploaded",
      };
    } catch (error: any) {
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
