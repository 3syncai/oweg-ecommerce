const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  process.env.MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

function getPublishableKey() {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY ||
    ""
  )
}

function getSalesChannelId() {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
    process.env.MEDUSA_SALES_CHANNEL_ID ||
    ""
  )
}

export function api(path: string, init?: RequestInit) {
  const base = MEDUSA_URL.replace(/\/$/, "")
  const url = `${base}${path}`
  const publishableKey = getPublishableKey()
  const salesChannelId = getSalesChannelId()
  return fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      ...(salesChannelId ? { "x-sales-channel-id": salesChannelId } : {}),
      ...(init?.headers || {}),
    },
  })
}

export { MEDUSA_URL }


