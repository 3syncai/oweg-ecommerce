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
