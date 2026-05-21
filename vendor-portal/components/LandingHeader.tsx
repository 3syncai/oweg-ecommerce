"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

/**
 * Shared navbar for the public-facing vendor pages (landing, about, blog).
 *
 * Kept dead-simple on purpose: no menu state, no client-side fetching,
 * just brand + links + a Sign-in CTA. Active route gets the brand colour
 * so the user always knows where they are.
 */
const LANDING_NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
] as const

export default function LandingHeader() {
  const pathname = usePathname()
  return (
    <header className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center" aria-label="OWEG home">
            <Image
              src="/Oweg.png"
              alt="OWEG Logo"
              width={140}
              height={48}
              className="h-12 w-auto cursor-pointer"
              priority
            />
          </Link>

          <nav className="flex items-center gap-4 sm:gap-8">
            {LANDING_NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "text-[#00D26A] font-semibold transition-colors"
                      : "text-gray-700 hover:text-[#00D26A] font-medium transition-colors"
                  }
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              )
            })}
            <Link
              href="/login"
              className="hidden sm:inline-flex bg-[#00D26A] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#00B856] transition-all shadow hover:shadow-md"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
