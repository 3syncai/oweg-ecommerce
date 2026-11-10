import { Headphones, Mail, MapPin, Phone, Send } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { storefrontSupport } from "@/lib/storefront-links";

export const metadata: Metadata = {
  title: "Contact and support",
  description: "Contact OWEG by phone or email for help with orders, delivery, returns, warranty, and seller enquiries.",
};

const channels = [
  {
    title: "Call us",
    copy: "Speak with a human for orders, delivery ETA, or installation help.",
    action: storefrontSupport.phone,
    icon: Phone,
    href: storefrontSupport.phoneHref,
  },
  {
    title: "Priority email",
    copy: "Drop a note for warranty, returns, or corporate orders.",
    action: storefrontSupport.email,
    icon: Mail,
    href: `mailto:${storefrontSupport.email}`,
  },
  {
    title: "Visit",
    copy: "Ascent Retechno India Pvt Ltd Av Pride, B-12, Ground Floor, Opp. Rahul, International School, Nilemore 4th Road, Nalasopara West, Thane, Maharashtra - 401203.",
    action: "Open Maps",
    icon: MapPin,
    href: "https://www.google.com/maps/search/?api=1&query=19.429464%2C72.809120",
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
              <div className="mt-3 flex min-w-0 items-center gap-2 font-semibold text-[var(--oweg-green-dark)]">
                <span className="min-w-0 [overflow-wrap:anywhere]">{ch.action}</span>
                <Send className="size-4 shrink-0 translate-x-0 transition group-hover:translate-x-1" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </section>


      </div>
    </div>
  );
}
