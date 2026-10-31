import { redirect } from "next/navigation";

// Keep previously shared reward-history links working too.
export default async function LegacyRewardOrderPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/account/orders/${encodeURIComponent(id)}`);
}
