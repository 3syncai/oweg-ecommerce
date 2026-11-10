import type { Metadata } from "next";
import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { privacyPolicy } from "@/content/policies/privacy";

export default function PrivacyPolicyPage() {
  return (
    <PolicyPageShell badge={privacyPolicy.badge} title={privacyPolicy.title}>
      <PolicySections document={privacyPolicy} />
    </PolicyPageShell>
  );
}

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Learn how OWEG handles your personal information when you browse, shop or contact support.",
};
