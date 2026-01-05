import { ClipboardCheck, RotateCcw, Truck } from "lucide-react";

const steps = [
  { title: "Request", copy: "From Profile → Orders, choose the item and tap 'Start a return'. Tell us what went wrong.", icon: ClipboardCheck },
  { title: "Pickup", copy: "We schedule pickup and provide packaging help if needed. Keep all accessories/manuals.", icon: Truck },
  { title: "Quality check", copy: "Item is inspected quickly. Refund/exchange triggers right after QC completion.", icon: RotateCcw },
];

const rules = [
  "Return window is typically 7 days from delivery—check the product page for exceptions.",
  "Products must be unused with original packaging, manuals, and all accessories.",
  "Damaged/defective on arrival? Raise it within 48 hours with photos for priority handling.",
  "Health & hygiene categories may be non-returnable unless sealed and unopened.",
  "Refund speed depends on payment method; COD refunds go to your chosen bank/UPI.",
];

export default function ReturnsPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/35 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            Returns Policy
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Returns built for peace of mind.</h1>
          <p className="text-gray-600">We keep returns predictable—clear steps, packaging help, and quick refunds after QC.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, idx) => (
            <div key={step.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                Step {idx + 1}
              </div>
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <step.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-gray-600">{step.copy}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-semibold">What to know</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
