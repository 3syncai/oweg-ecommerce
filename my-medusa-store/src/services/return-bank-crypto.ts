import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function getKey(): Buffer {
  const raw = process.env.RETURN_BANK_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("RETURN_BANK_ENCRYPTION_KEY is required.")
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("RETURN_BANK_ENCRYPTION_KEY must be 32 bytes (base64).")
  }
  return key
}

export function encryptBankDetails(details: Record<string, string>) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const payload = JSON.stringify(details)
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  })
}

export function decryptBankDetails(payload: string) {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string }
  const iv = Buffer.from(parsed.iv, "base64")
  const tag = Buffer.from(parsed.tag, "base64")
  const data = Buffer.from(parsed.data, "base64")
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString("utf8"))
}
