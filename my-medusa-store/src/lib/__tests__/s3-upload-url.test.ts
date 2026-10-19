import assert from "node:assert/strict"
import { test } from "node:test"
import { s3PublicBaseUrl } from "../s3-access"

test("upload URLs use the actual upload bucket when S3_FILE_URL points to an old bucket", () => {
  const previous = process.env.S3_FILE_URL
  try {
    process.env.S3_FILE_URL = "https://old-bucket.s3.ap-south-1.amazonaws.com"
    assert.equal(s3PublicBaseUrl("current-bucket", "ap-south-1"), "https://current-bucket.s3.ap-south-1.amazonaws.com")
  } finally {
    if (previous === undefined) delete process.env.S3_FILE_URL
    else process.env.S3_FILE_URL = previous
  }
})

test("matching configured bucket URL is retained without a duplicate slash", () => {
  const previous = process.env.S3_FILE_URL
  try {
    process.env.S3_FILE_URL = "https://current-bucket.s3.ap-south-1.amazonaws.com/"
    assert.equal(s3PublicBaseUrl("current-bucket", "ap-south-1"), "https://current-bucket.s3.ap-south-1.amazonaws.com")
  } finally {
    if (previous === undefined) delete process.env.S3_FILE_URL
    else process.env.S3_FILE_URL = previous
  }
})

test("explicit uploader configuration works when credentials are loaded by the upload route", () => {
  const previous = process.env.S3_FILE_URL
  try {
    delete process.env.S3_FILE_URL
    assert.equal(s3PublicBaseUrl("configured-bucket", "eu-west-1"), "https://configured-bucket.s3.eu-west-1.amazonaws.com")
  } finally {
    if (previous === undefined) delete process.env.S3_FILE_URL
    else process.env.S3_FILE_URL = previous
  }
})
