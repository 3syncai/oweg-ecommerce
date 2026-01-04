type ExtendedHeaders = Headers & {
  getSetCookie?: () => string[]
}

const MEDUSA_BASE_URL = (
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"
).replace(/\/$/, "")

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_API_KEY ||
  ""

const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
  process.env.MEDUSA_SALES_CHANNEL_ID ||
  ""

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
}

type MedusaFetchInit = RequestInit & {
  forwardedCookie?: string
  forwardedHeaders?: Record<string, string | undefined>
  skipContentType?: boolean
}

export function medusaStoreFetch(path: string, init?: MedusaFetchInit): Promise<Response> {
  const normalizedPath = path.startsWith("http")
    ? path
    : `${MEDUSA_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`

  const headers = new Headers({
    ...DEFAULT_HEADERS,
    ...(init?.headers as HeadersInit),
  })

  if (!init?.skipContentType && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  if (PUBLISHABLE_KEY && !headers.has("x-publishable-api-key")) {
    headers.set("x-publishable-api-key", PUBLISHABLE_KEY)
  }
  if (SALES_CHANNEL_ID && !headers.has("x-sales-channel-id")) {
    headers.set("x-sales-channel-id", SALES_CHANNEL_ID)
  }
  if (init?.forwardedCookie && !headers.has("cookie")) {
    headers.set("cookie", init.forwardedCookie)
  }
  if (init?.forwardedHeaders) {
    for (const [key, value] of Object.entries(init.forwardedHeaders)) {
      if (!value) continue
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    }
  }

  return fetch(normalizedPath, {
    cache: "no-store",
    ...init,
    headers,
  })
}

export async function readJsonSafely<T = unknown>(res: Response): Promise<T | null> {
  try {
    if (res.headers.get("content-type")?.includes("application/json")) {
      return (await res.json()) as T
    }
  } catch {
    // ignore
  }
  return null
}

export async function readTextSafely(res: Response): Promise<string | null> {
  try {
    return await res.text()
  } catch {
    return null
  }
}

export function collectSetCookies(headers: Headers): string[] {
  const headerWithHelper = headers as ExtendedHeaders
  if (typeof headerWithHelper.getSetCookie === "function") {
    return headerWithHelper.getSetCookie()
  }
  const cookie = headers.get("set-cookie")
  return cookie ? [cookie] : []
}

export function cookiesToHeader(cookies: string[]): string | undefined {
  const pairs = cookies
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean) as string[]
  return pairs.length ? pairs.join("; ") : undefined
}

export function appendUpstreamCookies(target: Response, upstream: Response) {
  const cookies = collectSetCookies(upstream.headers)
  cookies.forEach((cookie) => {
    target.headers.append("set-cookie", cookie)
  })
}

export type ErrorPayload = {
  error?: string
  message?: string
  [key: string]: unknown
}

export async function extractErrorPayload(res: Response): Promise<ErrorPayload | string | null> {
  const json = await readJsonSafely<ErrorPayload>(res)
  if (json) return json
  return readTextSafely(res)
}
