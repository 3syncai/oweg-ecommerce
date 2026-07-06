import { getSiteOrigin } from "@/lib/razorpay";

export function getSiteBaseUrl(): string {
  return getSiteOrigin(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
  );
}

export function absoluteUrl(path: string): string {
  const base = getSiteBaseUrl().replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
