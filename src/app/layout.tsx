// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import Footer from "./footer/Footer";
import Header from "./header/Header";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";

import { Providers } from "./providers";
import CartProvider from "@/contexts/CartProvider";
import AuthProvider from "@/contexts/AuthProvider";
import AppToaster from "@/components/ui/app-toaster";
import AffiliateRefCapture from "@/components/AffiliateRefCapture";

export const metadata: Metadata = {
  title: {
    default: "OWEG - Home Appliances & Electronics",
    template: "%s | OWEG",
  },
  description: "Shop home appliances, kitchen utensils, and electronics at OWEG.",
  applicationName: "OWEG",
  manifest: "/manifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-32x32.png"],
  },
  other: { display: "standalone" },
};

export const viewport: Viewport = {
  themeColor: "#7AC943",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <Providers>
          <AuthProvider>
            <CartProvider>
              <ServiceWorkerRegister />
              <Suspense fallback={null}>
                <AffiliateRefCapture />
              </Suspense>

              <div className="min-h-screen flex flex-col">
                <Header />

                <main className="flex-1 pb-24 md:pb-0">{children}</main>

                <Footer />
                <MobileBottomNav />
              </div>

              <AppToaster />
            </CartProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
