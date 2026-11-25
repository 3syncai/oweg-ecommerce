import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My rewards",
  description: "Check your OWEG rewards and see your coin activity.",
  robots: { index: false, follow: false },
};

export default function RewardsLayout({ children }: { children: ReactNode }) {
  return children;
}
