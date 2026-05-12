import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl =
      process.env.MEDUSA_BACKEND_URL ||
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
      "http://localhost:9000";

    const normalizedBackend = backendUrl.replace(/\/+$/, "");

    return [
      // Vendor APIs used by this app (auth, products, orders, stats, etc.)
      {
        source: "/api/medusa/vendor/:path*",
        destination: `${normalizedBackend}/vendor/:path*`,
      },
      // Vendor onboarding/profile routes under /store/vendors/*
      {
        source: "/api/medusa/store/vendors/:path*",
        destination: `${normalizedBackend}/store/vendors/:path*`,
      },
      // Vendor file upload route under /store/vendor/*
      {
        source: "/api/medusa/store/vendor/:path*",
        destination: `${normalizedBackend}/store/vendor/:path*`,
      },
      // Field validation route used in signup
      {
        source: "/api/medusa/vendors/validate",
        destination: `${normalizedBackend}/vendors/validate`,
      },
    ];
  },
};

export default nextConfig;
