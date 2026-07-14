import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@medusajs/ui";
import { ThemeProvider, themeBootstrapScript } from "@/lib/theme";
import { DebugControllerProvider } from "@/components/debug-controller/DebugControllerProvider";
import SiteProtections from "@/components/debug-controller/SiteProtections";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OWEG Vendor Portal",
  description: "Manage your OWEG store — products, orders, inventory & payouts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before paint to avoid FOUC */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <DebugControllerProvider>
            <SiteProtections />
            {children}
            <Toaster />
          </DebugControllerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
