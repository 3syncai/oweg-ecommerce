import { Crown, Gift, Star } from "lucide-react";

const tiers = [
  { name: "Green", spend: "₹0 - ₹14,999", perk: "1% back as OWEG Coins" },
  { name: "Lime", spend: "₹15,000 - ₹49,999", perk: "2% back + early access to specials" },
  { name: "Emerald", spend: "₹50,000+", perk: "3% back + priority delivery slots" },
];

const perks = [
  "Coins apply like cash at checkout",
  "Birthday perks and surprise upgrades",
  "Faster support with live chat priority",
  "Exclusive bundle prices every month",
];

export default function MyRewardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Crown className="w-4 h-4" />
            My Reward
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Earn coins, unlock perks, stay VIP.</h1>
          <p className="text-gray-600">Every purchase gives you OWEG Coins. Stack them for future checkouts or perks you’ll actually use.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.name} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                <Star className="w-4 h-4" />
                {tier.name}
              </div>
              <div className="text-lg font-semibold">{tier.spend}</div>
              <p className="text-sm text-gray-600">{tier.perk}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Gift className="w-4 h-4" />
            How to use coins
          </div>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            {perks.map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </section>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm font-semibold">
          Check your current tier and coin balance in Profile → My Reward. We keep it transparent and instant.
        </div>
      </div>
    </div>
  );
}
