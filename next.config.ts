import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/security-headers";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/offline", revision },
    { url: "/icon.png", revision },
    { url: "/icon-192x192.png", revision },
    { url: "/icon-512x512.png", revision },
    { url: "/icon-512x512-maskable.png", revision },
    { url: "/apple-touch-icon.png", revision },
    { url: "/favicon.ico", revision },
  ],
});

type RemotePattern = NonNullable<NextConfig["images"]>["remotePatterns"] extends
  | (infer T)[]
  | undefined
  ? T
  : never;

function buildRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [
    { protocol: "https", hostname: "images.unsplash.com" },
    { protocol: "https", hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com" },
    { protocol: "https", hostname: "medusa-public-images.s3.amazonaws.com" },
    { protocol: "http", hostname: "localhost", port: "9000" },
    { protocol: "http", hostname: "127.0.0.1", port: "9000" },
    { protocol: "https", hostname: "www.oweg.in" },
    { protocol: "https", hostname: "oweg.in" },
    { protocol: "https", hostname: "oweg-product-images.s3.ap-south-1.amazonaws.com" },
    { protocol: "https", hostname: "oweg-product-images-new.s3.ap-south-1.amazonaws.com" },
    { protocol: "https", hostname: "oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com" },
    { protocol: "https", hostname: "via.placeholder.com" },
  ];

  const seen = new Set(
    patterns.map((pattern) =>
      `${pattern.protocol}://${pattern.hostname}${"port" in pattern && pattern.port ? `:${pattern.port}` : ""}`,
    ),
  );

  for (const key of [
    "MEDUSA_BACKEND_URL",
    "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
    "S3_FILE_URL",
  ] as const) {
    const raw = process.env[key];
    if (!raw) continue;

    try {
      const parsed = new URL(raw);
      const protocol = parsed.protocol.replace(":", "") as "http" | "https";
      const signature = `${protocol}://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
      if (seen.has(signature)) continue;

      seen.add(signature);
      patterns.push({
        protocol,
        hostname: parsed.hostname,
        ...(parsed.port ? { port: parsed.port } : {}),
      });
    } catch {
      // Ignore invalid URLs in env.
    }
  }

  return patterns;
}

function buildAllowedDevOrigins(): string[] {
  const raw = process.env.DEV_TUNNEL_HOST?.trim();
  if (!raw) return [];

  try {
    const hostname = raw.includes("://") ? new URL(raw).hostname : raw.replace(/\/.*$/, "");
    return hostname ? [hostname] : [];
  } catch {
    const hostname = raw.replace(/^https?:\/\//, "").split("/")[0];
    return hostname ? [hostname] : [];
  }
}

const allowedDevOrigins = buildAllowedDevOrigins();

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-select",
      "@radix-ui/react-label",
      "@radix-ui/react-radio-group",
    ],
  },
  images: {
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns: buildRemotePatterns(),
  },
};

export default withSerwist(nextConfig);
