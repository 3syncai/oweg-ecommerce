import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export class S3Service {
    private s3Client: S3Client
    private bucketName: string

    constructor() {
        const region = process.env.S3_REGION || "us-east-1"

        this.s3Client = new S3Client({
            region,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
            },
        })

        this.bucketName = process.env.S3_BUCKET || ""

        if (!this.bucketName) {
            console.warn("⚠️ S3_BUCKET environment variable not set")
        }
    }

    /**
     * Upload brand authorization file to S3
     */
    async uploadBrandAuthorization(
        vendorId: string,
        brandName: string,
        file: Buffer,
        fileName: string,
        mimeType: string
    ): Promise<{ url: string; key: string }> {
        // Sanitize brand name for file path
        const sanitizedBrand = this.sanitizeForPath(brandName)
        const timestamp = Date.now()
        const sanitizedFileName = this.sanitizeForPath(fileName)

        // Construct S3 key
        const key = `vendor-authorizations/${vendorId}/${sanitizedBrand}/${timestamp}-${sanitizedFileName}`

        // Upload to S3
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: file,
            ContentType: mimeType,
            // Make file private - use signed URLs for access
            ACL: "private",
            Metadata: {
                vendorId,
                brandName,
                uploadedAt: new Date().toISOString(),
            },
        })

        await this.s3Client.send(command)

        // Generate URL (you can use CloudFront if configured)
        const url = `https://${this.bucketName}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com/${key}`

        return { url, key }
    }

    /**
     * Delete brand authorization file from S3
     */
    async deleteBrandAuthorization(key: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        })

        await this.s3Client.send(command)
    }

    /**
     * Get signed URL for accessing a private file
     */
    async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        })

        return await getSignedUrl(this.s3Client, command, { expiresIn })
    }

    /**
     * Sanitize string for use in file paths
     */
    private sanitizeForPath(str: string): string {
        return str
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "")
    }
}

export default new S3Service()
