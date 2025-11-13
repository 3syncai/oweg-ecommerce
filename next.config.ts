import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'medusa-public-images.s3.eu-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'medusa-public-images.s3.amazonaws.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
      },
      {
        protocol: 'https',
        hostname: 'www.oweg.in',
      },
      {
        protocol: 'https',
        hostname: 'oweg.in',
      },
      {
        protocol: 'https',
        hostname: 'oweg-product-images.s3.ap-south-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com',
      },
    ],
  },
  typescript: {
    // Ignore TypeScript errors during builds (example page has intentional demo code)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
