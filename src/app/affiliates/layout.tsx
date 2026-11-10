import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Affiliate programme",
  description: "Learn how to share OWEG products and earn referral rewards through the OWEG affiliate programme.",
};

export default function AffiliatesLayout({ children }: { children: ReactNode }) {
  return children;
}
