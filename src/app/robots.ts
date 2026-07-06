import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account/",
        "/checkout",
        "/cart",
        "/login",
        "/signup",
        "/forgot",
        "/reset-password",
        "/orders",
        "/myaccount",
        "/debug-controller-4719",
        "/maintenance",
        "/offline",
        "/example",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
