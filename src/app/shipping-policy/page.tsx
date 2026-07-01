import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { shippingPolicy } from "@/content/policies/shipping";

export default function ShippingPolicyPage() {
  return (
    <PolicyPageShell badge={shippingPolicy.badge} title={shippingPolicy.title}>
      <PolicySections document={shippingPolicy} />
    </PolicyPageShell>
  );
}
