// app/layout.tsx
import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import Footer from "./footer/Footer";
import HeaderSkeleton from "./header/HeaderSkeleton";
import MobileBottomNavShell from "@/components/mobile/MobileBottomNavShell";

import { Providers } from "./providers";
import CartProvider from "@/contexts/CartProvider";
import AuthProvider from "@/contexts/AuthProvider";
import AppToaster from "@/components/ui/app-toaster";
import AffiliateRefCapture from "@/components/AffiliateRefCapture";
import SmoothScroll from "@/components/SmoothScroll";
import { DebugControllerProvider } from "@/components/debug-controller/DebugControllerProvider";
import SiteProtections from "@/components/debug-controller/SiteProtections";
import ConditionalWhatsAppWidget from "@/components/debug-controller/ConditionalWhatsAppWidget";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

const Header = dynamic(() => import("./header/Header"), {
  loading: () => <HeaderSkeleton />,
});

export const metadata: Metadata = {
  title: {
    default: "OWEG - Home Appliances & Electronics",
    template: "%s | OWEG",
  },
  description: "Shop home appliances, kitchen utensils, and electronics at OWEG.",
  applicationName: "OWEG",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
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
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body
        className="min-h-full antialiased scroll-smooth"
        suppressHydrationWarning
      >
        <Providers>
          <DebugControllerProvider>
            <AuthProvider>
              <CartProvider>
                <SmoothScroll />
                <ServiceWorkerRegister />
                <Suspense fallback={null}>
                  <AffiliateRefCapture />
                </Suspense>

                <div className="min-h-screen flex flex-col">
                  <SiteProtections />
                  <Header />

                  <main
                    className="flex-1 pb-24 md:pb-0"
                    style={{ paddingTop: "var(--app-header-height, 136px)" }}
                  >
                    {children}
                  </main>

                  <Footer />
                  <MobileBottomNavShell />
                  <ConditionalWhatsAppWidget />
                  <PWAInstallPrompt />
                </div>

                <AppToaster />
              </CartProvider>
            </AuthProvider>
          </DebugControllerProvider>
        </Providers>
      </body>
    </html>
  );
}
