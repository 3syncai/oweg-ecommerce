import { Clock, MapPin, Package } from "lucide-react";

const RocketIcon = () => <Clock className="w-6 h-6" />;

const highlights = [
  { title: "Dispatch speed", copy: "Most in-stock items dispatch within 24 hours. Metro express slots open during checkout.", icon: RocketIcon },
  { title: "Live tracking", copy: "Track from your profile with real-time hand-off updates and installer details when applicable.", icon: MapPin },
  { title: "Protected transit", copy: "Appliances ship with reinforced packaging and shock indicators where required.", icon: Package },
];

export default function ShippingPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            Shipping Policy
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Fast, predictable, and careful deliveries.</h1>
          <p className="text-gray-600">
            We show live ETAs at checkout and keep you updated from dispatch to installation. Here’s how we ship.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <item.icon />
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.copy}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-2 text-sm text-gray-700 leading-relaxed">
          <div className="font-semibold text-lg text-gray-900">Key details</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Delivery fees depend on pin code, weight, and speed. All costs show before you pay.</li>
            <li>Some heavy/fragile products need a delivery slot confirmation; we call you to align schedules.</li>
            <li>Installation-ready: eligible appliances share installer contact + visit window inside order details.</li>
            <li>Remote pin codes may need extra transit time; we’ll notify you if ETAs change.</li>
            <li>Refuse delivery if packaging is visibly damaged and inform us immediately for priority resolution.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
