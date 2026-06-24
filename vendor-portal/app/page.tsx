"use client"

import Link from "next/link"
import Image from "next/image"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"

const HERO_STATS = [
  { value: "100+", label: "Active sellers" },
  { value: "2K+", label: "Products listed" },
  { value: "24/7", label: "Seller support" },
] as const

const HERO_CHIPS = [
  "Zero commission",
  "Fast payouts",
  "Bulk product upload",
  "Real-time dashboard",
] as const

const BENEFITS = [
  {
    title: "Zero commission",
    description:
      "List and sell without platform commission. Keep more of every sale and reinvest in growth.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    ),
  },
  {
    title: "Fast payments",
    description:
      "Track payouts in one place with transparent settlement cycles and reliable disbursements.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    title: "Real-time analytics",
    description:
      "Monitor orders, revenue, and inventory from a dashboard built for day-to-day selling.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    title: "Dedicated support",
    description:
      "Get help when you need it — from onboarding to catalog setup and order fulfilment.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
      />
    ),
  },
] as const

const VENDOR_TOOLS = [
  {
    title: "Product catalog",
    description: "Create variants, manage SKUs, and keep listings organised.",
  },
  {
    title: "Bulk upload",
    description: "Import hundreds of products from Excel in a single workflow.",
  },
  {
    title: "Order management",
    description: "Fulfill orders, update status, and track customer history.",
  },
  {
    title: "Inventory sync",
    description: "Stock levels update as you sell — fewer oversell mistakes.",
  },
  {
    title: "Payout tracking",
    description: "See earnings and settlement status without spreadsheets.",
  },
  {
    title: "Collections & categories",
    description: "Group products the way customers browse on OWEG.",
  },
] as const

const STEPS = [
  {
    step: "01",
    title: "Create your account",
    description:
      "Sign up as a vendor, add store details, and complete verification.",
  },
  {
    step: "02",
    title: "Build your catalog",
    description:
      "Add products individually or bulk-upload — images, pricing, and inventory.",
  },
  {
    step: "03",
    title: "Go live & sell",
    description:
      "Once approved, your store is live. Manage orders and payouts from one portal.",
  },
] as const

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-oweg-200 bg-oweg-50 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-oweg-800">
      {children}
    </span>
  )
}

function CheckIcon({ className = "text-oweg-600" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${className}`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <LandingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-oweg-500 via-oweg-600 to-oweg-800 text-white">
        <div className="landing-hero-grid absolute inset-0" aria-hidden />
        <div
          className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-white/20 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-12">
            <div className="text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                India&apos;s fastest-growing seller platform
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
                Sell online with{" "}
                <span className="bg-gradient-to-r from-white via-emerald-50 to-white/80 bg-clip-text text-transparent">
                  OWEG
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl lg:mx-0">
                Join thousands of sellers on India&apos;s marketplace. Zero commission,
                instant setup, and a vendor portal built for serious growth.
              </p>

              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  href="/signup"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-oweg-700 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-xl sm:w-auto"
                >
                  Start selling now
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-xl border-2 border-white/35 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto"
                >
                  Sign in
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
                {HERO_CHIPS.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/95 backdrop-blur-sm sm:text-sm"
                  >
                    {chip}
                  </li>
                ))}
              </ul>

              <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-4 lg:max-w-lg">
                {HERO_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/20 bg-white/10 px-3 py-4 text-center backdrop-blur-md sm:px-4 sm:text-left lg:text-left"
                  >
                    <div className="text-2xl font-extrabold sm:text-3xl">{stat.value}</div>
                    <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/75 sm:text-xs">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto flex w-full max-w-md justify-center lg:max-w-none">
              <div className="landing-glow absolute inset-0 scale-110" aria-hidden />
              <div className="animate-landing-float relative">
                <Image
                  src="/Oweg3d-400.png"
                  alt="OWEG marketplace"
                  width={560}
                  height={560}
                  className="relative z-10 h-auto w-full max-w-[22rem] drop-shadow-2xl sm:max-w-md lg:max-w-lg"
                  priority
                />
              </div>
              <div className="absolute -bottom-4 left-1/2 z-20 hidden -translate-x-1/2 rounded-2xl border border-white/30 bg-white/95 px-5 py-3 shadow-xl backdrop-blur sm:flex lg:left-8 lg:translate-x-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-oweg-100">
                    <svg className="h-5 w-5 text-oweg-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900">Vendor portal ready</p>
                    <p className="text-xs text-zinc-500">Dashboard · Orders · Payouts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/15 bg-black/10 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-4 text-center text-sm text-white/85 sm:px-6 lg:px-8">
            <span className="font-medium text-white">Trusted by sellers across India</span>
            <span className="hidden h-4 w-px bg-white/25 sm:block" aria-hidden />
            <span>Secure payouts</span>
            <span className="hidden sm:inline">·</span>
            <span>Catalog tools</span>
            <span className="hidden sm:inline">·</span>
            <span>24/7 support</span>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-gradient-to-b from-zinc-50 to-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <SectionBadge>Why OWEG</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              Everything you need to grow
            </h2>
            <p className="mt-4 text-lg text-zinc-600">
              A seller-first platform with tools, transparency, and support — not just a storefront.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((item) => (
              <article
                key={item.title}
                className="group oweg-card rounded-2xl border border-zinc-100 bg-white p-7 transition hover:-translate-y-1 hover:border-oweg-200 hover:shadow-lg hover:shadow-oweg-500/5"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-oweg-500 to-oweg-700 text-white shadow-md shadow-oweg-500/25 transition group-hover:scale-105">
                  <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-zinc-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Vendor portal tools */}
      <section className="border-y border-zinc-100 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionBadge>Vendor portal</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                One dashboard for your entire store
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-zinc-600">
                The OWEG vendor portal is where you manage catalog, orders, inventory, and
                payouts — without juggling spreadsheets or third-party tools.
              </p>
              <ul className="mt-8 space-y-3">
                {["IST-based insights & greetings", "SKU validation & variant matrix", "Search across orders & products"].map(
                  (line) => (
                    <li key={line} className="flex items-start gap-3 text-sm text-zinc-700 sm:text-base">
                      <CheckIcon />
                      {line}
                    </li>
                  )
                )}
              </ul>
              <Link
                href="/signup"
                className="oweg-btn-primary mt-10 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white"
              >
                Open your seller account
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {VENDOR_TOOLS.map((tool) => (
                <div
                  key={tool.title}
                  className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-5 transition hover:border-oweg-200 hover:bg-oweg-50/50"
                >
                  <h3 className="font-semibold text-zinc-900">{tool.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{tool.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <SectionBadge>Getting started</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-lg text-zinc-600">
              From signup to your first order — we keep onboarding simple.
            </p>
          </div>

          <div className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            <div
              className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-12 hidden h-0.5 bg-gradient-to-r from-transparent via-oweg-300 to-transparent md:block"
              aria-hidden
            />
            {STEPS.map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="relative z-10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-oweg-500 to-oweg-700 text-lg font-bold text-white shadow-lg shadow-oweg-500/30">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold text-zinc-900">{item.title}</h3>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-zinc-600 sm:text-base">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-oweg-500 via-oweg-600 to-oweg-800 py-20 text-white sm:py-24">
        <div className="landing-hero-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Ready to start selling?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/90 sm:text-xl">
            Create your vendor account in minutes. No credit card required.
          </p>
          <Link
            href="/signup"
            className="mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-lg font-bold text-oweg-700 shadow-xl transition hover:-translate-y-0.5 hover:bg-zinc-50"
          >
            Get started free
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/85">
            <li className="flex items-center gap-2">
              <CheckIcon className="text-white" />
              Free to sign up
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="text-white" />
              Zero commission
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="text-white" />
              Go live in days
            </li>
          </ul>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
