import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Search products",
  description: "Search OWEG for home appliances, kitchen essentials, electronics and more.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
