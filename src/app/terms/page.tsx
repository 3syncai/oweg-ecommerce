import { Check, Shield } from "lucide-react";

const sections = [
  {
    title: "Orders & eligibility",
    points: [
      "Use accurate contact, address, and payment info to avoid delays.",
      "Some pin codes or heavy appliances may need prepaid/part-payment—shown before checkout.",
      "Misuse, fraud, or abnormal returns can lead to account review.",
    ],
  },
  {
    title: "Pricing & payments",
    points: [
      "We show all inclusive prices with tax; delivery fees depend on pin code/weight.",
      "COD is available on most pin codes; some products may be prepaid only.",
      "For partial payments, balance is collected before dispatch/installation.",
    ],
  },
  {
    title: "Returns & refunds",
    points: [
      "Standard return window: 7 days for most products; check listing specifics.",
      "Items must be unused with all accessories/manuals/packaging for pickup.",
      "Refunds follow QC completion; timelines depend on payment method.",
    ],
  },
  {
    title: "Warranty & service",
    points: [
      "Brand warranty terms apply; details live on each product page.",
      "Installation/servicing may be performed by authorized brand partners.",
      "We assist with service bookings, but brand policies govern coverage.",
    ],
  },
  {
    title: "Privacy & data",
    points: [
      "We use data to fulfill orders, personalize, and improve support.",
      "Secure payments via trusted gateways; card data is tokenized.",
      "You can request data export or deletion per our privacy policy.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Shield className="w-4 h-4" />
            Terms & Conditions
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Clear terms for a smooth OWEG experience.</h1>
          <p className="text-gray-600">
            These highlights summarize how we operate. For anything not covered here, contact support and we’ll clarify fast.
          </p>
        </header>

        <section className="grid gap-4">
          {sections.map((section) => (
            <div key={section.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                {section.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm font-semibold">
          Need more detail? Write to compliance@oweg.in and we’ll share the full policy PDF for your region.
        </div>
      </div>
    </div>
  );
}
