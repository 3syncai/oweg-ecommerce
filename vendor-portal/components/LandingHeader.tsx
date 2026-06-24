"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { OWEG_BRAND } from "@/lib/brand"

const LANDING_NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
] as const

export default function LandingHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-oweg-200/60 bg-white/90 shadow-sm shadow-oweg-500/5 backdrop-blur-xl"
          : "border-b border-transparent bg-white/70 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="OWEG home">
          <Image
            src={OWEG_BRAND.logoPathLight}
            alt="OWEG"
            width={132}
            height={44}
            className="h-10 w-auto sm:h-11"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LANDING_NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  active
                    ? "text-oweg-700"
                    : "text-zinc-600 hover:text-oweg-600"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:text-oweg-700 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex rounded-xl bg-oweg-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-oweg-900 sm:px-5"
          >
            Start selling
          </Link>
          <button
            type="button"
            className="inline-flex rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-zinc-100 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {LANDING_NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-oweg-50 text-oweg-800" : "text-zinc-700"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <Link
              href="/login"
              className="mt-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-center text-sm font-semibold text-zinc-800"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
