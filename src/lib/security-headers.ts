type Header = { key: string; value: string };

/** Image/CDN hosts aligned with next.config.ts `images.remotePatterns`. */
const IMAGE_HOSTS = [
  "images.unsplash.com",
  "medusa-public-images.s3.eu-west-1.amazonaws.com",
  "medusa-public-images.s3.amazonaws.com",
  "www.oweg.in",
  "oweg.in",
  "oweg-product-images.s3.ap-south-1.amazonaws.com",
  "oweg-product-images-new.s3.ap-south-1.amazonaws.com",
  "oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com",
  "via.placeholder.com",
];

const RAZORPAY_ORIGINS = [
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://cdn.razorpay.com",
  "https://lumberjack.razorpay.com",
];

function parseOrigin(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

function getMedusaConnectOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:9000",
    "http://127.0.0.1:9000",
  ]);

  for (const key of ["MEDUSA_BACKEND_URL", "NEXT_PUBLIC_MEDUSA_BACKEND_URL"]) {
    const origin = parseOrigin(process.env[key]);
    if (origin) origins.add(origin);
  }

  return [...origins];
}

export function buildContentSecurityPolicy(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const medusaOrigins = getMedusaConnectOrigins();
  const imageSources = [
    "'self'",
    "data:",
    "blob:",
    ...IMAGE_HOSTS.map((host) => `https://${host}`),
    "https://*.amazonaws.com",
  ];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://checkout.razorpay.com",
    "https://cdn.razorpay.com",
  ];
  if (!isProduction) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    `connect-src 'self' ${[...medusaOrigins, ...RAZORPAY_ORIGINS].join(" ")}`,
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function getSecurityHeaders(): Header[] {
  const isProduction = process.env.NODE_ENV === "production";
  const useReportOnly = process.env.CSP_REPORT_ONLY === "true";
  const cspHeaderKey = useReportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  const headers: Header[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: cspHeaderKey, value: buildContentSecurityPolicy() },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
