import Link from "next/link"
import Image from "next/image"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"

export const metadata = {
  title: "About OWEG — Building India's Seller-First Marketplace",
  description:
    "Learn the story, mission and team behind OWEG, India's fastest-growing zero-commission e-commerce platform for sellers.",
}

const STATS = [
  { value: "100+", label: "Active Sellers" },
  { value: "2K+", label: "Products Listed" },
  { value: "15+", label: "States Served" },
  { value: "24/7", label: "Seller Support" },
] as const

const VALUES = [
  {
    title: "Seller-first, always",
    body: "Every feature we ship is graded against one question: does this make life easier for a seller? If the answer isn't a clear yes, we don't ship it.",
    icon: (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    title: "Zero hidden fees",
    body: "No commission, no listing fees, no payment-gateway markup. The price you see is the price you pay — sellers keep 100% of what they earn.",
    icon: (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Built in India",
    body: "OWEG is engineered in India, for Indian sellers. We understand UPI, COD, return policies and the realities of shipping across 28 states.",
    icon: (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "Move fast, ship daily",
    body: "We ship product updates every week. New dashboards, faster payouts, better analytics — driven directly by what sellers ask for.",
    icon: (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
] as const

const MILESTONES = [
  {
    year: "2025",
    title: "Idea born in Mumbai",
    body: "Founded with a simple promise: zero-commission selling for India's small businesses.",
  },
  {
    year: "Q2 2025",
    title: "First 50 sellers onboarded",
    body: "Hand-onboarded the first cohort, learned from every conversation, rebuilt the dashboard twice.",
  },
  {
    year: "Q4 2025",
    title: "Seller Portal v1",
    body: "Launched the full vendor portal — products, orders, payouts, analytics — all in one place.",
  },
  {
    year: "2026",
    title: "Crossed 100+ active sellers",
    body: "Today serving 100+ active sellers across 15+ states, with 2K+ products live.",
  },
] as const

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white pt-20 pb-24 md:pt-28 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute bottom-10 right-20 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
            About OWEG
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Building the seller-first
            <br />
            marketplace for India.
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            OWEG is a zero-commission e-commerce platform built so that the smallest
            seller in the smallest town can compete with the largest brand in the country.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="-mt-12 relative z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-10">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-extrabold text-[#00D26A] mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-3">
              <div className="inline-block mb-4 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
                Our Story
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Why OWEG exists.
              </h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-base md:text-lg">
                <p>
                  Indian online marketplaces are stacked against the small seller —
                  commissions of 20% or more, payment cycles measured in weeks, and
                  buried policy changes that wipe out margins overnight.
                </p>
                <p>
                  OWEG was started in 2025 with a single, stubborn belief: a seller
                  who packs the box should get to keep most of what they earn. So we
                  built the opposite of what the giants offer — <strong>zero
                  commission, transparent payouts, and a dashboard that actually
                  shows you the truth.</strong>
                </p>
                <p>
                  Today, 100+ sellers across 15+ states call OWEG home. We&apos;re still
                  early, still hand-onboarding most new sellers ourselves, and still
                  reading every single piece of feedback that comes in.
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 flex justify-center">
              <div className="relative w-full max-w-sm">
                <Image
                  src="/Oweg3d-400.png"
                  alt="OWEG"
                  width={500}
                  height={500}
                  className="w-full h-auto drop-shadow-2xl"
                  quality={100}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
              What we believe
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
              The four things we won&apos;t compromise on.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Every product decision at OWEG runs through these four filters.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-[#00D26A]/30 hover:-translate-y-1"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-lg">
                  {value.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{value.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-block mb-4 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
              Milestones
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
              The journey so far.
            </h2>
          </div>

          <ol className="relative border-l-2 border-[#00D26A]/30 ml-3 space-y-10">
            {MILESTONES.map((m) => (
              <li key={m.year + m.title} className="pl-8 relative">
                <span className="absolute -left-[11px] top-1 w-5 h-5 rounded-full bg-[#00D26A] ring-4 ring-[#00D26A]/20" />
                <div className="text-sm font-semibold text-[#00D26A] mb-1">
                  {m.year}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {m.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{m.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 md:py-24 bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight">
            Sell with people who put sellers first.
          </h2>
          <p className="text-lg md:text-xl mb-10 text-white/90 max-w-2xl mx-auto">
            Setup takes minutes. No credit card, no commission, no catch.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-white text-[#00D26A] px-10 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 transition-all shadow-2xl hover:-translate-y-1 hover:scale-105"
            >
              Start Selling →
            </Link>
            <Link
              href="/blog"
              className="bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-white/20 transition-all"
            >
              Read the blog
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
