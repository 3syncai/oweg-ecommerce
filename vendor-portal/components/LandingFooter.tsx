import Link from "next/link"
import Image from "next/image"

/**
 * Shared footer for the public-facing vendor pages. Same content as the
 * inline footer that lived on the landing page.
 */
export default function LandingFooter() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div>
            <Image
              src="/Oweg.png"
              alt="OWEG Logo"
              width={140}
              height={48}
              className="h-10 w-auto mb-6 brightness-0 invert"
            />
            <p className="text-sm leading-relaxed">
              India&apos;s fastest-growing e-commerce platform for sellers. Start selling today!
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-5 text-lg">For Sellers</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/signup"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Become a Seller
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Seller Login
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Seller Resources
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-5 text-lg">Company</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/about"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Blog
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Contact Us
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-5 text-lg">Legal</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="#"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-white transition-colors hover:translate-x-1 inline-block"
                >
                  Seller Agreement
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} OWEG. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
