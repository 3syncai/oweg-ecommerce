import { Headphones, Mail, MapPin, Phone, Send } from "lucide-react";
import Link from "next/link";

const channels = [
  {
    title: "Call us",
    copy: "Speak with a human for orders, delivery ETA, or installation help.",
    action: "+91 8797787877",
    icon: Phone,
    href: "tel:+918797787877",
  },
  {
    title: "Priority email",
    copy: "Drop a note for warranty, returns, or corporate orders.",
    action: "owegonline@oweg.in",
    icon: Mail,
    href: "mailto:owegonline@oweg.in",
  },
  {
    title: "Visit",
    copy: "Ascent Retechno India Pvt Ltd Av Pride, B-12, Ground Floor, Opp. Rahul, International School, Nilemore 4th Road, Nalasopara West, Thane, Maharashtra - 401203.",
    action: "Open Maps",
    icon: MapPin,
    href: "https://maps.google.com?q=AV+Crystal+Nallasopara+East+Palghar",
  },
];

export default function ContactPage() {
  return (
    <div className="oweg-page min-h-screen text-[var(--oweg-ink)]">
      <div className="oweg-container max-w-5xl space-y-10 py-10 md:space-y-12 md:py-16">
        <header className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-4 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
            <Headphones className="w-4 h-4" />
            Talk to OWEG
          </div>
          <h1 className="oweg-title text-[clamp(1.6rem,1.1rem+2.4vw,2.5rem)]">We respond fast—call, mail, or chat.</h1>
          <p className="oweg-subtle mx-auto max-w-3xl">
            Human-first support for orders, appliances, returns, and partnerships. Pick the channel you like—we&apos;ll meet you there.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
          {channels.map((ch) => (
            <Link
              key={ch.title}
              href={ch.href}
              className="oweg-surface-card group p-5 transition hover:-translate-y-1 hover:border-[var(--oweg-green)] hover:shadow-[var(--oweg-shadow-lg)] sm:p-6"
            >
              <div className="oweg-icon-tile h-12 w-12 text-[var(--oweg-green-dark)]">
                <ch.icon className="w-6 h-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold sm:text-lg">{ch.title}</h3>
              <p className="mt-2 text-sm text-[var(--oweg-ink-muted)]">{ch.copy}</p>
              <div className="mt-3 inline-flex items-center gap-2 font-semibold text-[var(--oweg-green-dark)]">
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
