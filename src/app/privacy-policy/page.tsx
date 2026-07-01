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
