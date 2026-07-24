import {
  extractTrackingEvents,
  extractTrackingStatus,
  normalizeTrackingStatus,
  summarizeTrackingPayload,
} from "../lib/vendor-order-workflow"
import ShiprocketService from "./shiprocket"

type ProviderConfig = {
  aliases?: string[]
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  tracking_url?: string
}

type TrackInput = {
  courierPartnerName?: string | null
  awb?: string | null
  trackingSource?: "shiprocket" | "carrier_api" | "manual" | null
}

const TRACKING_URL_TEMPLATES: Record<string, string> = {
  shiprocket: "https://shiprocket.co/tracking/{awb}",
  shadowfax: "https://shadowfax.in/track-order/{awb}",
  delhivery: "https://www.delhivery.com/track/package/{awb}",
  bluedart: "https://www.bluedart.com/tracking?trackNo={awb}",
  dtdc: "https://www.dtdc.in/tracking.asp?strCnno={awb}",
  ecomexpress: "https://ecomexpress.in/tracking/?awb_field={awb}",
  xpressbees: "https://www.xpressbees.com/track?isawb=Yes&track={awb}",
}

function normalizePartner(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
}

function withAwb(template: string | undefined, awb: string) {
  return template ? template.replace(/\{awb\}/gi, encodeURIComponent(awb)) : null
}

function loadProviderConfigs() {
  const raw = process.env.SELF_SHIPPING_TRACKING_PROVIDERS
  if (!raw) return {} as Record<string, ProviderConfig>

  try {
    return JSON.parse(raw) as Record<string, ProviderConfig>
  } catch (error: any) {
    console.warn("[self-shipping-tracking] Invalid SELF_SHIPPING_TRACKING_PROVIDERS JSON:", error?.message)
    return {}
  }
}

function getShadowfaxConfig(): ProviderConfig | null {
  const url = process.env.SHADOWFAX_TRACKING_URL
  if (!url) return null

  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  const apiKey = process.env.SHADOWFAX_API_KEY || process.env.SHADOWFAX_TOKEN
  if (apiKey) {
    const header = process.env.SHADOWFAX_AUTH_HEADER || "Authorization"
    const prefix = process.env.SHADOWFAX_AUTH_PREFIX ?? "Bearer"
    headers[header] = prefix ? `${prefix} ${apiKey}` : apiKey
  }

  return {
    aliases: ["shadowfax", "shadowfaxtechnologies", "shadowfaxcourier"],
    url,
    method: process.env.SHADOWFAX_TRACKING_METHOD || "GET",
    headers,
    tracking_url: process.env.SHADOWFAX_PUBLIC_TRACKING_URL || TRACKING_URL_TEMPLATES.shadowfax,
  }
}

function findProviderConfig(partner: string) {
  const normalized = normalizePartner(partner)
  const configs = loadProviderConfigs()

  const shadowfax = getShadowfaxConfig()
  if (shadowfax) configs.shadowfax = shadowfax

  for (const [key, config] of Object.entries(configs)) {
    const aliases = [key, ...(config.aliases || [])].map(normalizePartner)
    if (aliases.includes(normalized)) {
      return { key: normalizePartner(key), config }
    }
  }

  return null
}

function buildBody(body: unknown, awb: string) {
  if (body == null) return undefined
  if (typeof body === "string") return body.replace(/\{awb\}/gi, awb)
  return JSON.stringify(body).replace(/\{awb\}/gi, awb)
}

function getKnownTrackingUrl(partner: string, awb: string) {
  const key = normalizePartner(partner)
  const template = Object.entries(TRACKING_URL_TEMPLATES).find(([carrier]) =>
    key.includes(normalizePartner(carrier))
  )?.[1]

  return withAwb(template, awb)
}

function normalizeGenericTrackingPayload(payload: any, provider: string, partner: string, awb: string) {
  const status = extractTrackingStatus(payload) || normalizeTrackingStatus(
    payload?.shipment_status ||
      payload?.tracking_status ||
      payload?.data?.shipment_status ||
      payload?.data?.tracking_status
  )

  const genericEvents =
    payload?.events ||
    payload?.scans ||
    payload?.checkpoints ||
    payload?.data?.events ||
    payload?.data?.scans ||
    payload?.data?.checkpoints

  if (Array.isArray(genericEvents) && !extractTrackingEvents(payload).length) {
    payload = {
      ...payload,
      tracking_data: {
        ...(payload?.tracking_data || {}),
        shipment_track_activities: genericEvents.map((event: any) => ({
          date: event?.date || event?.time || event?.timestamp || event?.created_at,
          status: event?.status || event?.scan || event?.activity || event?.remark,
          activity: event?.activity || event?.remark || event?.status || event?.scan,
          location: event?.location || event?.city,
        })),
      },
    }
  }

  return summarizeTrackingPayload({
    provider,
    courierPartnerName: partner,
    awb,
    payload,
    status,
  })
}

export async function trackSelfShipment({ courierPartnerName, awb, trackingSource }: TrackInput) {
  const partner = String(courierPartnerName || "").trim()
  const trackingId = String(awb || "").trim()
  const fallbackTrackingUrl = getKnownTrackingUrl(partner, trackingId)

  if (!partner || !trackingId) {
    return summarizeTrackingPayload({
      provider: "self",
      courierPartnerName: partner || null,
      awb: trackingId || null,
      status: "not_shipped",
      error: "Courier partner and AWB/tracking id are required for self-shipping tracking.",
    })
  }

  if (trackingSource === "shiprocket") {
    try {
      const shiprocket = new ShiprocketService()
      const payload = await shiprocket.trackByAwb(trackingId)
      return {
        ...summarizeTrackingPayload({
          provider: "shiprocket",
          courierPartnerName: partner || "Shiprocket",
          awb: trackingId,
          payload,
          status: extractTrackingStatus(payload),
        }),
        tracking_url: TRACKING_URL_TEMPLATES.shiprocket.replace("{awb}", encodeURIComponent(trackingId)),
        source: "shiprocket",
      }
    } catch (error: any) {
      return {
        ...summarizeTrackingPayload({
          provider: "shiprocket",
          courierPartnerName: partner || "Shiprocket",
          awb: trackingId,
          status: "not_shipped",
          error:
            error?.message ||
            "Shiprocket could not track this AWB. Confirm the AWB is available under the configured Shiprocket account.",
        }),
        tracking_url: TRACKING_URL_TEMPLATES.shiprocket.replace("{awb}", encodeURIComponent(trackingId)),
        source: "provider_error",
      }
    }
  }

  const provider = findProviderConfig(partner)
  if (!provider) {
    return {
      ...summarizeTrackingPayload({
        provider: "self",
        courierPartnerName: partner,
        awb: trackingId,
        status: "not_shipped",
        error:
          "Live tracking is not configured for this courier. Add a carrier API adapter or aggregator credentials to fetch checkpoints automatically.",
      }),
      tracking_url: fallbackTrackingUrl,
      source: "not_configured",
    }
  }

  const url = withAwb(provider.config.url, trackingId)
  if (!url) {
    return {
      ...summarizeTrackingPayload({
        provider: provider.key,
        courierPartnerName: partner,
        awb: trackingId,
        status: "not_shipped",
        error: "Tracking provider URL is missing the {awb} placeholder.",
      }),
      tracking_url: withAwb(provider.config.tracking_url, trackingId) || fallbackTrackingUrl,
      source: "misconfigured",
    }
  }

  const method = (provider.config.method || "GET").toUpperCase()
  const body = method === "GET" ? undefined : buildBody(provider.config.body || { awb: "{awb}" }, trackingId)

  const response = await fetch(url, {
    method,
    headers: provider.config.headers || {},
    body,
  })

  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    return {
      ...summarizeTrackingPayload({
        provider: provider.key,
        courierPartnerName: partner,
        awb: trackingId,
        status: "not_shipped",
        error: `Tracking provider returned ${response.status}. Check courier credentials or AWB ownership.`,
      }),
      tracking_url: withAwb(provider.config.tracking_url, trackingId) || fallbackTrackingUrl,
      source: "provider_error",
      provider_response: payload,
    }
  }

  return {
    ...normalizeGenericTrackingPayload(payload, provider.key, partner, trackingId),
    tracking_url: withAwb(provider.config.tracking_url, trackingId) || fallbackTrackingUrl,
    source: "carrier_api",
  }
}
