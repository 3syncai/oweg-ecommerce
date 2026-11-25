import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "My account",
    template: "%s | OWEG",
  },
  description: "Manage your OWEG profile, orders, addresses and notifications.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
