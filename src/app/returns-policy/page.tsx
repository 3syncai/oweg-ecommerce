import type { Metadata } from "next";
import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { returnsPolicy } from "@/content/policies/returns";

export default function ReturnsPolicyPage() {
  return (
    <PolicyPageShell badge={returnsPolicy.badge} title={returnsPolicy.title}>
      <PolicySections document={returnsPolicy} />
    </PolicyPageShell>
  );
}

export const metadata: Metadata = {
  title: "Returns and replacements",
  description: "Read the OWEG returns policy for eligibility, timelines and how to request a return or replacement.",
};
