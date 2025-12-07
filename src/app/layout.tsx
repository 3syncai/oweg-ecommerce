// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import Footer from "./footer/Footer";
import Header from "./header/Header";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";

import { Providers } from "./providers";
import CartProvider from "@/contexts/CartProvider";
import AuthProvider from "@/contexts/AuthProvider";
import AppToaster from "@/components/ui/app-toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OWEG - Home Appliances & Electronics",
    template: "%s | OWEG",
  },
  description: "Shop home appliances, kitchen utensils, and electronics at OWEG.",
  applicationName: "OWEG",
  manifest: "/manifest",
  icons: {
    icon: "/oweg_O.png",
    shortcut: "/oweg_O.png",
    apple: "/oweg_O.png",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <AuthProvider>
            <CartProvider>
              <ServiceWorkerRegister />

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
