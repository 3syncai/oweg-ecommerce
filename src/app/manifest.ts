import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OWEG PWA",
    short_name: "OWEG",
    description:
      "Shop home appliances, kitchen utensils, and electronics at OWEG.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7AC943",
    categories: ["shopping"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Cart",
        short_name: "Cart",
        description: "View your shopping cart",
        url: "/cart",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Orders",
        short_name: "Orders",
        description: "Track and manage your orders",
        url: "/account/orders",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Search",
        short_name: "Search",
        description: "Search products on OWEG",
        url: "/search",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    screenshots: [
      {
        src: "/login.png",
        sizes: "1441x1092",
        type: "image/png",
        form_factor: "narrow",
        label: "Sign in and shop on OWEG",
      },
      {
        src: "/Banner.png",
        sizes: "2560x780",
        type: "image/png",
        form_factor: "wide",
        label: "Browse home appliances and electronics",
      },
    ],
  };
}
