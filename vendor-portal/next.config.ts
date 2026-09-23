import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Medusa traffic is proxied at runtime via app/api/medusa/[...path]/route.ts
  // so MEDUSA_BACKEND_URL can be changed on Vercel without rebuilding.
  // Pin Turbopack to this app so it does not resolve parent storefront deps (tailwind v4).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
