"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
(0, utils_1.loadEnv)(process.env.NODE_ENV || "development", process.cwd());
exports.default = (0, utils_1.defineConfig)({
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
            dependencies: [utils_1.Modules.CACHE, utils_1.ContainerRegistrationKeys.LOGGER],
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
                            file_url: process.env.S3_FILE_URL ??
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVkdXNhLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL21lZHVzYS1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBcUc7QUFFckcsSUFBQSxlQUFPLEVBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLElBQUksYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFBO0FBRTdELGtCQUFlLElBQUEsb0JBQVksRUFBQztJQUMxQixhQUFhLEVBQUU7UUFDYixXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZO1FBQ3JDLElBQUksRUFBRTtZQUNKLG1FQUFtRTtZQUNuRSxtREFBbUQ7WUFDbkQsMENBQTBDO1lBQzFDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSwrRUFBK0U7WUFDcEgsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLHVCQUF1QjtZQUM1RCxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksK0VBQStFO1lBQ2xILFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxhQUFhO1lBQ2xELFlBQVksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsSUFBSSxhQUFhO1NBQ3pEO0tBQ0Y7SUFDRCwrQkFBK0I7SUFDL0IsS0FBSyxFQUFFO1FBQ0wsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDWCxNQUFNLEVBQUU7Z0JBQ04sWUFBWSxFQUFFO29CQUNaLFdBQVc7b0JBQ1gsV0FBVztvQkFDWCxvQkFBb0I7aUJBQ3JCO2FBQ0Y7U0FDRixDQUFDO0tBQ0g7SUFDRCxPQUFPLEVBQUU7UUFDUDtZQUNFLE9BQU8sRUFBRSx1QkFBdUI7WUFDaEMsWUFBWSxFQUFFLENBQUMsZUFBTyxDQUFDLEtBQUssRUFBRSxpQ0FBeUIsQ0FBQyxNQUFNLENBQUM7WUFDL0QsT0FBTyxFQUFFO2dCQUNQLFNBQVMsRUFBRTtvQkFDVDt3QkFDRSxPQUFPLEVBQUUsaUNBQWlDO3dCQUMxQyxFQUFFLEVBQUUsV0FBVzt3QkFDZixPQUFPLEVBQUU7d0JBQ1AscUNBQXFDO3lCQUN0QztxQkFDRjtpQkFDRjthQUNGO1NBQ0Y7UUFDRDtZQUNFLE9BQU8sRUFBRSxnQkFBZ0I7WUFDekIsT0FBTyxFQUFFO2dCQUNQLE9BQU8sRUFBRSxJQUFJO2dCQUNiLFNBQVMsRUFBRTtvQkFDVDt3QkFDRSxPQUFPLEVBQUUsbUJBQW1CO3dCQUM1QixFQUFFLEVBQUUsSUFBSTt3QkFDUixPQUFPLEVBQUU7NEJBQ1AsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUzs0QkFDN0IsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUzs0QkFDN0IsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCOzRCQUMzQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQjs0QkFDbkQsUUFBUSxFQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVztnQ0FDdkIsV0FBVyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsZ0JBQWdCOzRCQUM5RSxpQkFBaUIsRUFBRTtnQ0FDakIsR0FBRyxFQUFFLFNBQVM7NkJBQ2Y7eUJBQ0Y7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsc0JBQXNCO1NBQ2hDO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsMEJBQTBCO1NBQ3BDO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsK0JBQStCO1lBQ3hDLE9BQU8sRUFBRTtnQkFDUCxTQUFTLEVBQUU7b0JBQ1Q7d0JBQ0UsT0FBTyxFQUFFLG1DQUFtQzt3QkFDNUMsRUFBRSxFQUFFLHFCQUFxQjt3QkFDekIsT0FBTyxFQUFFOzRCQUNQLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQzs0QkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYzs0QkFDbEMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVzt5QkFDOUI7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGO0tBQ0Y7Q0FDRixDQUFDLENBQUEifQ==