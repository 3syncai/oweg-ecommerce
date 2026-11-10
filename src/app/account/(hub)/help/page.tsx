import type { Metadata } from "next";
import HelpSupportContent from "@/components/account/HelpSupportContent";

export default function AccountHelpPage() {
  return <HelpSupportContent embedded />;
}

export const metadata: Metadata = {
  title: "Account help and support",
  description: "Get help with OWEG orders, returns, delivery and account access.",
};
