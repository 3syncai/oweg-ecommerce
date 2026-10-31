import { S3FileService } from "@medusajs/file-s3/dist/services/s3-file"
import type { S3Client } from "@aws-sdk/client-s3"

/** Bucket-owner-enforced storage uses IAM/bucket policy, never object ACLs. */
export class OwegS3FileService extends S3FileService {
  protected getClient(): S3Client {
    const client = super.getClient()
    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === "PutObjectCommand") {
          const input = args.input as { ACL?: unknown }
          delete input.ACL
        }
        return next(args)
      },
      { step: "initialize", name: "owegBucketOwnerEnforcedUpload", priority: "high" }
    )
    return client
  }
}
