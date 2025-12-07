import { Eye, Lock, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "What we collect",
    points: [
      "Contact, address, and order details to fulfill purchases.",
      "Device and usage signals to keep your account secure and improve the app.",
      "Payment info is tokenized by trusted gateways; we don’t store card numbers.",
    ],
  },
  {
    title: "How we use it",
    points: [
      "To process orders, arrange delivery/installation, and provide support.",
      "To personalize recommendations and surface relevant offers responsibly.",
      "To detect fraud, protect your account, and meet legal obligations.",
    ],
  },
  {
    title: "Your controls",
    points: [
      "Access, update, or delete your data by writing to privacy@oweg.in.",
      "Opt out of marketing at any time from your profile or in-email link.",
      "Request data export for transparency on what we store.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Privacy Policy
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">We protect your data and give you control.</h1>
          <p className="text-gray-600">
            This summary highlights how we handle your information. For detailed clauses or region-specific terms, contact us anytime.
          </p>
        </header>

        <section className="grid gap-4">
          {sections.map((section) => (
            <div key={section.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                <Lock className="w-4 h-4" />
                {section.title}
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                {section.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <Eye className="w-4 h-4 text-emerald-600 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm font-semibold">
          Reach privacy@oweg.in for data requests. We respond quickly and keep you updated through the process.
        </div>
      </div>
    </div>
  );
}
