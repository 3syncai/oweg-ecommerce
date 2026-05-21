import Link from "next/link"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"
import NewsletterForm from "@/components/NewsletterForm"

export const metadata = {
  title: "OWEG Blog — Seller stories, playbooks and platform updates",
  description:
    "Tips, playbooks, and platform updates for sellers building their business on OWEG.",
}

type BlogPost = {
  slug: string
  title: string
  excerpt: string
  category: "Seller Playbook" | "Product Update" | "Stories" | "Guides"
  readingTimeMin: number
  publishedAt: string
  accent: "emerald" | "sky" | "violet" | "amber"
}

const POSTS: BlogPost[] = [
  {
    slug: "zero-commission-explained",
    title: "Zero commission, explained: how OWEG actually makes money",
    excerpt:
      "We charge 0% commission. Sellers ask us all the time how the business stays alive. Here's the honest answer — and why this model is built to last.",
    category: "Stories",
    readingTimeMin: 5,
    publishedAt: "2026-05-12",
    accent: "emerald",
  },
  {
    slug: "list-your-first-product",
    title: "The 9-step playbook to list your first product in under 10 minutes",
    excerpt:
      "From signing up to publishing your first SKU, this is the exact checklist our top sellers follow. Includes image specs, title tips, and pricing rules.",
    category: "Guides",
    readingTimeMin: 8,
    publishedAt: "2026-05-08",
    accent: "sky",
  },
  {
    slug: "pricing-for-cod-india",
    title: "Pricing for COD: a framework for Indian sellers",
    excerpt:
      "Cash on delivery still drives 60%+ of orders in tier-2 and -3 India. Here's how to price for it without losing your margin to returns.",
    category: "Seller Playbook",
    readingTimeMin: 7,
    publishedAt: "2026-05-02",
    accent: "amber",
  },
  {
    slug: "new-payout-dashboard",
    title: "Product update: faster payouts and a brand-new analytics dashboard",
    excerpt:
      "T+1 payouts on every order, plus a redesigned dashboard with conversion, repeat-buyer and SKU-level insights. Rolling out this week.",
    category: "Product Update",
    readingTimeMin: 4,
    publishedAt: "2026-04-28",
    accent: "violet",
  },
  {
    slug: "from-side-hustle-to-shop",
    title: "From side hustle to full-time shop: Priya's story",
    excerpt:
      "Priya started selling hand-poured candles on weekends. Eighteen months later, she's running a five-person workshop. Here's exactly how she did it.",
    category: "Stories",
    readingTimeMin: 6,
    publishedAt: "2026-04-21",
    accent: "emerald",
  },
  {
    slug: "winning-product-photography",
    title: "Product photography that actually converts (with a ₹0 lighting setup)",
    excerpt:
      "Forget studios. With a window, a ₹40 white sheet, and these five composition rules, you'll have photos that beat 90% of the catalogue.",
    category: "Guides",
    readingTimeMin: 6,
    publishedAt: "2026-04-15",
    accent: "sky",
  },
]

const ACCENT_CARD: Record<BlogPost["accent"], string> = {
  emerald: "from-emerald-50 to-white border-emerald-100 hover:border-emerald-300",
  sky: "from-sky-50 to-white border-sky-100 hover:border-sky-300",
  violet: "from-violet-50 to-white border-violet-100 hover:border-violet-300",
  amber: "from-amber-50 to-white border-amber-100 hover:border-amber-300",
}

const ACCENT_BADGE: Record<BlogPost["accent"], string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  sky: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  amber: "bg-amber-100 text-amber-800",
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function BlogPage() {
  const [featured, ...rest] = POSTS

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white pt-20 pb-24 md:pt-28 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 right-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute bottom-10 left-20 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
            OWEG Blog
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Playbooks, stories &amp;<br className="hidden sm:block" /> product updates.
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            Practical writing for sellers — from your first listing to your hundredth order — and
            the platform updates we ship each week.
          </p>
        </div>
      </section>

      {/* Featured */}
      <section className="-mt-12 relative z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href={`/blog/${featured.slug}`}
            className="group block bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all"
          >
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div
                className={`relative bg-gradient-to-br ${ACCENT_CARD[featured.accent]} p-10 md:p-12 flex flex-col justify-center`}
              >
                <span
                  className={`inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold w-fit ${ACCENT_BADGE[featured.accent]}`}
                >
                  Featured · {featured.category}
                </span>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 leading-tight group-hover:text-[#00D26A] transition-colors">
                  {featured.title}
                </h2>
                <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                  {featured.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{formatDate(featured.publishedAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{featured.readingTimeMin} min read</span>
                </div>
              </div>
              <div className="hidden md:flex bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] items-center justify-center p-12 text-white">
                <div className="text-center">
                  <div className="text-8xl font-extrabold mb-3 opacity-90">
                    OWEG
                  </div>
                  <p className="text-white/90 font-medium">Stories for sellers</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Posts grid */}
      <section className="py-20 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-2">
            <div>
              <div className="inline-block mb-3 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
                Latest posts
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Fresh off the press
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              {rest.length} {rest.length === 1 ? "article" : "articles"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group flex flex-col bg-gradient-to-br ${ACCENT_CARD[post.accent]} rounded-2xl p-6 border-2 hover:-translate-y-1 transition-all`}
              >
                <span
                  className={`inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold w-fit ${ACCENT_BADGE[post.accent]}`}
                >
                  {post.category}
                </span>
                <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 leading-snug group-hover:text-[#00D26A] transition-colors">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-200/60">
                  <span>{formatDate(post.publishedAt)}</span>
                  <span>{post.readingTimeMin} min read</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="pb-20 md:pb-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white p-10 md:p-14 text-center shadow-2xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Get the seller playbook in your inbox.
            </h2>
            <p className="text-white/90 mb-7 max-w-xl mx-auto">
              One short, practical email every Tuesday. No spam, unsubscribe whenever.
            </p>
            <NewsletterForm />
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
