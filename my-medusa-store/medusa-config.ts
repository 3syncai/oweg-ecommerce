import { loadEnv, defineConfig, Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      // CORS configuration — list every first-party origin that the browser
      // is allowed to hit /store, /admin, /auth from. Supports plain origins
      // OR regex literals wrapped in slashes (e.g. /^https:\/\/foo-.*$/).
      //
      // We include the production storefront, vendor portal, and their
      // Vercel preview deployments so PR previews work too. Any *_CORS env
      // var on the host *replaces* the matching default — when you set
      // STORE_CORS make sure it contains every URL listed below or things
      // will break in production.
      //
      //   Storefront:    https://oweg-ecommerce.vercel.app + previews
      //   Vendor portal: https://oweg-vendor-portal.vercel.app + previews
      //   Affiliate:     http://localhost:5000
      storeCors:
        process.env.STORE_CORS ||
        [
          "http://localhost:3000",
          "http://localhost:3001",
          process.env.VENDOR_CORS || "http://localhost:4000",
          "https://oweg-ecommerce.vercel.app",
          "https://oweg-vendor-portal.vercel.app",
          "/^https:\\/\\/oweg-ecommerce-[a-z0-9-]+\\.vercel\\.app$/",
          "/^https:\\/\\/oweg-vendor-portal-[a-z0-9-]+\\.vercel\\.app$/",
        ].join(","),
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001",
      authCors:
        process.env.AUTH_CORS ||
        [
          "http://localhost:3000",
          "http://localhost:3001",
          process.env.VENDOR_CORS || "http://localhost:4000",
          "https://oweg-ecommerce.vercel.app",
          "https://oweg-vendor-portal.vercel.app",
          "/^https:\\/\\/oweg-ecommerce-[a-z0-9-]+\\.vercel\\.app$/",
          "/^https:\\/\\/oweg-vendor-portal-[a-z0-9-]+\\.vercel\\.app$/",
        ].join(","),
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    cookieOptions: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  admin: {
    // Use /api path for Vercel proxy - this makes cookies first-party
    // Vercel rewrites /api/* to https://api.oweg.itshover.com/*
    backendUrl: process.env.MEDUSA_ADMIN_BACKEND_URL || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:9000"),
    vite: () => ({
      server: {
        allowedHosts: [
          "localhost",
          "127.0.0.1",
          ".trycloudflare.com",
          "evasive-laverne-semipaganish.ngrok-free.dev"
        ],
      },
    }),
  },
  modules: [
    // {
    //   resolve: "@medusajs/medusa/auth",
    //   dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
    //   options: {
    //     providers: [
    //       {
    //         resolve: "@medusajs/medusa/auth-emailpass",
    //         id: "emailpass",
    //         options: {
    //           // optional provider-specific options
    //         },
    //       },
    //     ],
    //   },
    // },
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
      resolve: "./src/modules/vendor-brand-authorization",
    },
    {
      resolve: "./src/modules/flash-sale",
    },
    {
      resolve: "./src/modules/affiliate",
    },
    {
      resolve: "./src/modules/returns",
    },
    // {
    //   resolve: "@medusajs/medusa/notification",
    //   options: {
    //     providers: [
    //       {
    //         resolve: "./src/modules/email-notifications",
    //         id: "resend-notification",
    //         options: {
    //           channels: ["email"],
    //           apiKey: process.env.RESEND_API_KEY,
    //           from: process.env.RESEND_FROM,
    //         },
    //       },
    //     ],
    //   },
    // },
  ],
})

