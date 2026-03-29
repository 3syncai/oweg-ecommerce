import { Headphones, Mail, MapPin, Phone, Send } from "lucide-react";
import Link from "next/link";

const channels = [
  {
    title: "Call us",
    copy: "Speak with a human for orders, delivery ETA, or installation help.",
    action: "+91 87977 87877",
    icon: Phone,
    href: "tel:+91 87977 87877",
  },
  {
    title: "Priority email",
    copy: "Drop a note for warranty, returns, or corporate orders.",
    action: "support@oweg.in",
    icon: Mail,
    href: "mailto:owegonline@oweg.in",
  },
  {
    title: "Visit / write",
    copy: "Ascent Retechno India Pvt Ltd Av Pride, B-12, Ground Floor, Opp. Rahul, International School, Nilemore 4th Road, Nalasopara West, Thane, Maharashtra - 401203.",
    action: "Open Maps",
    icon: MapPin,
    href: "https://maps.google.com?q=AV+Crystal+Nallasopara+East+Palghar",
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Headphones className="w-4 h-4" />
            Talk to OWEG
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">We respond fast—call, mail, or chat.</h1>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Human-first support for orders, appliances, returns, and partnerships. Pick the channel you like—we&apos;ll meet you there.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {channels.map((ch) => (
            <Link
              key={ch.title}
              href={ch.href}
              className="group rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_22px_48px_-28px_rgba(0,0,0,0.45)]"
            >
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <ch.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mt-4">{ch.title}</h3>
              <p className="text-sm text-gray-600 mt-2">{ch.copy}</p>
              <div className="mt-3 inline-flex items-center gap-2 text-emerald-700 font-semibold">
                {ch.action}
                <Send className="w-4 h-4 translate-x-0 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          ))}
        </section>


      </div>
    </div>
  );
}
