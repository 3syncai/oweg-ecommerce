import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { rewardPolicy } from "@/content/policies/reward";

export default function RewardPolicyPage() {
  return (
    <PolicyPageShell badge={rewardPolicy.badge} title={rewardPolicy.title}>
      <PolicySections document={rewardPolicy} />
    </PolicyPageShell>
  );
}
