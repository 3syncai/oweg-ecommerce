type Header = { key: string; value: string };

/** Static hosts for third-party / leftover product URLs. Current bucket comes from env. */
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

/** Public S3 hosts from the same env the storefront/Medusa deploy already uses.
 * Next.js only inlines static `process.env.NAME` access — never `process.env[key]`.
 */
export function resolveConfiguredS3ImageHosts(): string[] {
  const hosts = new Set<string>();

  const addUrlHost = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    try {
      const hostname = new URL(raw.trim()).hostname;
      if (hostname) hosts.add(hostname);
    } catch {
      // Ignore invalid URLs in env.
    }
  };

  // Static property access required for Next.js env inlining (local + production).
  addUrlHost(process.env.S3_FILE_URL);
  addUrlHost(process.env.NEXT_PUBLIC_S3_FILE_URL);

  const bucket = process.env.S3_BUCKET?.trim();
  const region = (process.env.S3_REGION || "ap-south-1").trim();
  if (bucket) {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`);
    hosts.add(`${bucket}.s3.amazonaws.com`);
  }

  return [...hosts];
}

export function getAllowedImageHosts(): string[] {
  return [...new Set([...IMAGE_HOSTS, ...resolveConfiguredS3ImageHosts()])];
}

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
  const isProduction = process.env.NODE_ENV === "production";
  const origins = new Set<string>();

  if (!isProduction) {
    origins.add("http://localhost:9000");
    origins.add("http://127.0.0.1:9000");
  }

  for (const key of ["MEDUSA_BACKEND_URL", "NEXT_PUBLIC_MEDUSA_BACKEND_URL"]) {
    const origin = parseOrigin(process.env[key]);
    if (origin) origins.add(origin);
  }

  return [...origins];
}

export function buildContentSecurityPolicy(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const medusaOrigins = getMedusaConnectOrigins();
  const imageHosts = getAllowedImageHosts();
  const imageSources = [
    "'self'",
    "data:",
    "blob:",
    ...imageHosts.map((host) => `https://${host}`),
  ];

  // Service workers fetch() image URLs; that requires connect-src, not only img-src.
  const imageConnectOrigins = imageHosts.map((host) => `https://${host}`);

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
    `connect-src 'self' ${[...medusaOrigins, ...RAZORPAY_ORIGINS, ...imageConnectOrigins].join(" ")}`,
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    // Razorpay checkout posts forms to api.razorpay.com and bank pages
    "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
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
