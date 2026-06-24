import Link from "next/link"
import Image from "next/image"
import { OWEG_BRAND } from "@/lib/brand"

export default function LandingFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-4">
          <div>
            <Image
              src={OWEG_BRAND.logoPathLight}
              alt="OWEG"
              width={140}
              height={48}
              className="mb-5 h-10 w-auto brightness-0 invert"
            />
            <p className="max-w-xs text-sm leading-relaxed">
              India&apos;s fastest-growing marketplace for sellers. List products, fulfil orders,
              and get paid — all from one vendor portal.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
              For sellers
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/signup" className="transition hover:text-oweg-400">
                  Become a seller
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition hover:text-oweg-400">
                  Seller login
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition hover:text-oweg-400">
                  Seller resources
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
              Company
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/about" className="transition hover:text-oweg-400">
                  About
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition hover:text-oweg-400">
                  Blog
                </Link>
              </li>
              <li>
                <a href="#" className="transition hover:text-oweg-400">
                  Contact us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">
              Legal
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#" className="transition hover:text-oweg-400">
                  Privacy policy
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-oweg-400">
                  Terms of service
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-oweg-400">
                  Seller agreement
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-800 pt-8 text-sm sm:flex-row">
          <p>&copy; {new Date().getFullYear()} OWEG. All rights reserved.</p>
          <p className="text-zinc-500">
            Built for vendors · Powered by{" "}
            <span className="font-medium text-oweg-500">{OWEG_BRAND.primary}</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
