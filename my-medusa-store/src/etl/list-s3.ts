import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export default async function main() {
  const region = process.env.AWS_REGION || "ap-south-1";
  const bucket = process.env.OBJECT_STORAGE_BUCKET || "oweg-media-mumbai-krj-2025";

  // If LIST_PREFIX is set, use it. Else use OBJECT_STORAGE_PREFIX + "/products/"
  const base = process.env.OBJECT_STORAGE_PREFIX || "opencart";
  const fallback = (base.replace(/\/+$/,'') + "/products/").replace(/\/+/g, "/");
  const prefix = (process.env.LIST_PREFIX || fallback).replace(/\/+/g, "/");

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  let token: string | undefined = undefined;
  let total = 0;
  console.log("Listing with prefix:", prefix);

  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }));

    for (const o of res.Contents || []) {
      const when = o.LastModified ? new Date(o.LastModified).toISOString() : "";
      console.log(`${when}\t${o.Key}`);
    }

    total += res.KeyCount || 0;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  console.log(`---\nTOTAL: ${total}`);
}
