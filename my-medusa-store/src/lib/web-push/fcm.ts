import { createSign } from "node:crypto"
import { readFileSync } from "node:fs"

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id: string
  token_uri?: string
}

type AccessCache = { token: string; expiresAt: number }

let cachedAccount: ServiceAccount | null | undefined
let cachedAccess: AccessCache | null = null

function readServiceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON
  const filePath = process.env.FCM_SERVICE_ACCOUNT_FILE
  try {
    if (inline) {
      cachedAccount = JSON.parse(inline) as ServiceAccount
      return cachedAccount
    }
    if (filePath) {
      cachedAccount = JSON.parse(readFileSync(filePath, "utf8")) as ServiceAccount
      return cachedAccount
    }
  } catch {
    cachedAccount = null
    return null
  }
  cachedAccount = null
  return null
}

export function fcmConfigured(): boolean {
  const account = readServiceAccount()
  const project = process.env.FCM_PROJECT_ID || account?.project_id || ""
  return Boolean(account?.client_email && account?.private_key && project)
}

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) {
    return cachedAccess.token
  }
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: account.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  )
  const unsigned = `${header}.${claim}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  const signature = base64url(signer.sign(account.private_key))
  const assertion = `${unsigned}.${signature}`
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  })
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(4000),
  })
  const json = (await response.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!response.ok || !json.access_token) {
    throw Object.assign(new Error(json.error || "FCM auth failed"), { statusCode: response.status || 401 })
  }
  cachedAccess = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in || 3600)) * 1000,
  }
  return json.access_token
}

export async function sendFcmMessage(input: {
  token: string
  title: string
  body: string
  url: string
  image?: string | null
  tag?: string
  clickToken?: string
  ttlSeconds: number
}) {
  const account = readServiceAccount()
  if (!account) throw Object.assign(new Error("FCM is not configured"), { statusCode: 503 })
  const projectId = process.env.FCM_PROJECT_ID || account.project_id
  const accessToken = await getAccessToken(account)
  const data: Record<string, string> = {
    url: input.url,
    path: input.url,
  }
  if (input.clickToken) data.clickToken = input.clickToken
  if (input.tag) data.tag = input.tag

  const message: Record<string, unknown> = {
    token: input.token,
    notification: {
      title: input.title,
      body: input.body,
      ...(input.image ? { image: input.image } : {}),
    },
    data,
    android: {
      ttl: `${Math.max(1, input.ttlSeconds)}s`,
      priority: "HIGH",
      notification: {
        channelId: "oweg_marketing",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      headers: {
        "apns-expiration": String(Math.floor(Date.now() / 1000) + Math.max(1, input.ttlSeconds)),
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          "mutable-content": 1,
        },
      },
    },
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(4000),
    }
  )
  if (response.ok) return
  const errBody = await response.text().catch(() => "")
  let statusCode = response.status
  if (/NOT_FOUND|UNREGISTERED|INVALID_ARGUMENT/i.test(errBody)) statusCode = response.status === 404 ? 404 : 410
  throw Object.assign(new Error("FCM send failed"), { statusCode, body: errBody.slice(0, 200) })
}
