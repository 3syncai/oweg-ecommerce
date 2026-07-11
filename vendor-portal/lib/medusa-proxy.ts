import { NextRequest, NextResponse } from "next/server";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

/** Strip on responses — Node fetch may decompress the body but leave encoding headers. */
const STRIP_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP,
  "content-encoding",
  "content-length",
]);

/** Do not ask upstream for compressed payloads we will re-serve to the browser. */
const STRIP_REQUEST_HEADERS = new Set([...HOP_BY_HOP, "accept-encoding"]);

export function getMedusaBackendUrl(): string {
  const url =
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "";

  if (!url) {
    throw new Error(
      "MEDUSA_BACKEND_URL is not configured. Set it in Vercel environment variables."
    );
  }

  return url.replace(/\/+$/, "");
}

export async function proxyMedusaRequest(
  req: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  let backendBase: string;
  try {
    backendBase = getMedusaBackendUrl();
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Medusa backend not configured" },
      { status: 503 }
    );
  }

  const path = pathSegments.map(encodeURIComponent).join("/");
  const search = req.nextUrl.search;
  const targetUrl = `${backendBase}/${path}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_REQUEST_HEADERS.has(lower)) return;
    headers.set(key, value);
  });

  const publishableKey =
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
  if (publishableKey && !headers.has("x-publishable-api-key")) {
    headers.set("x-publishable-api-key", publishableKey);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[medusa-proxy] upstream failed:", targetUrl, error);
    return NextResponse.json(
      {
        message: "Failed to reach Medusa backend",
        backend: backendBase,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
