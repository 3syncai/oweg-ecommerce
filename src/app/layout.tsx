// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import Footer from "./footer/Footer"; // <-- check path, change if needed
import Header from "./header/Header"
import { Providers } from "./providers";

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
  manifest: "/manifest.webmanifest",
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
          <ServiceWorkerRegister />

          {/* Layout wrapper: makes page min-height = viewport and pushes footer down */}
          <div className="min-h-screen flex flex-col">
            {/* If you have a Header/Nav, render it here */}
            <Header />

            {/* Main content grows to take remaining space */}
            <main className="flex-1">
              {children}
            </main>

            {/* Footer placed after main so it stays at bottom */}
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
