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
