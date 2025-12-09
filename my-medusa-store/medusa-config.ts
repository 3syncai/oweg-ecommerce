import { loadEnv, defineConfig, Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      // CORS configuration - supports comma-separated URLs or single URL
      // Frontend URL: https://oweg-ecommerce.vercel.app/
      // Affiliate Portal: http://localhost:5000
      storeCors: process.env.STORE_CORS || "http://localhost:3000,http://localhost:5000,https://oweg-ecommerce.vercel.app",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001",
      authCors: process.env.AUTH_CORS || "http://localhost:3000,http://localhost:5000,https://oweg-ecommerce.vercel.app",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  // Add this admin configuration
  admin: {
    vite: () => ({
      server: {
        allowedHosts: [
          "localhost",
          "127.0.0.1",
          ".trycloudflare.com"
        ],
      },
    }),
  },
  modules: [
    {
      resolve: "@medusajs/medusa/auth",
      dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
            options: {
              // optional provider-specific options
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/file",
      options: {
        default: "s3",
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              bucket: process.env.S3_BUCKET,
              region: process.env.S3_REGION,
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              file_url:
                process.env.S3_FILE_URL ??
                `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`,
              additionalOptions: {
                ACL: undefined,
              },
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/vendor",
    },
    {
      resolve: "./src/modules/flash-sale",
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/email-notifications",
            id: "resend-notification",
            options: {
              channels: ["email"],
              apiKey: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM,
            },
          },
        ],
      },
    },
  ],
})
