import type { Metadata } from "next";
import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { rewardPolicy } from "@/content/policies/reward";

export const metadata: Metadata = {
  title: "Reward Policy",
  description:
    "How OWEG rewards and loyalty benefits are earned and redeemed.",
  alternates: { canonical: "/reward-policy" },
};

export default function RewardPolicyPage() {
  return (
    <PolicyPageShell badge={rewardPolicy.badge} title={rewardPolicy.title}>
      <PolicySections document={rewardPolicy} />
    </PolicyPageShell>
  );
}
