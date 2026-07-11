import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Medusa traffic is proxied at runtime via app/api/medusa/[...path]/route.ts
  // so MEDUSA_BACKEND_URL can be changed on Vercel without rebuilding.
};

export default nextConfig;
