import type { Metadata } from "next";
import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { termsPolicy } from "@/content/policies/terms";

export default function TermsPage() {
  return (
    <PolicyPageShell badge={termsPolicy.badge} title={termsPolicy.title}>
      <PolicySections document={termsPolicy} />
    </PolicyPageShell>
  );
}

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "Read the terms that apply when you shop on OWEG or use our marketplace.",
};
