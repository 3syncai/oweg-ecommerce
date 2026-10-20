import Link from "next/link"
import { ArrowRight, FileSpreadsheet, Camera, Package } from "lucide-react"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"
import { sellerArticles } from "@/lib/seller-articles"
import styles from "../SellerContent.module.css"

export const metadata = { title: "OWEG Blog | Practical guides for sellers", description: "Prepare your first listing, bulk upload, product photos and packed dimensions with OWEG seller guides." }
const icons = [FileSpreadsheet, Camera, Package]
export default function BlogPage() {
  const [featured, ...rest] = sellerArticles
  return <div className={styles.page}><a className={styles.skip} href="#main-content">Skip to content</a><LandingHeader />
    <main id="main-content">
      <section className={styles.hero}><div className={`${styles.container} ${styles.blogIntro}`}><p className={styles.eyebrow}>THE OWEG SELLER JOURNAL</p><h1>Small steps.<br /><span>Better selling habits.</span></h1><p className={styles.lead}>Practical guides for the work behind your store. From preparing your first listing to getting your next Excel upload ready.</p><a className={styles.secondary} href="#seller-guides">Explore the guides <ArrowRight size={17} /></a></div></section>
      <section className={`${styles.container} ${styles.section}`}><Link href={`/blog/${featured.slug}`} className={styles.featured}>
        <div className={styles.featureArt} aria-hidden="true"><div className={styles.miniStore}><div className={styles.storeAwning}><i /><i /><i /><i /></div><div className={styles.storeBody}><Package size={48} strokeWidth={1.2} /><div><span /><span /><span /></div></div><div className={styles.storeCheck}>Ready for your first product</div></div><span>THE FIRST LISTING</span><strong>Start with<br />the essentials.</strong></div>
        <div className={styles.featureCopy}><span className={styles.tag}>START HERE · {featured.category}</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><span className={styles.readLink}>Read the guide <ArrowRight size={18} /></span><span className={styles.readTime}>{featured.readingTime} min read</span></div>
      </Link></section>
      <section id="seller-guides" className={`${styles.container} ${styles.guides}`}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>A LITTLE HELP ALONG THE WAY</p><h2>Keep your store moving.</h2></div><span>{sellerArticles.length} seller guides</span></div>
        <div className={styles.cards}>{rest.map((post, index) => { const Icon = icons[index]; return <Link key={post.slug} href={`/blog/${post.slug}`} className={`${styles.card} ${styles.articleCard}`}><div className={`${styles.articleArt} ${styles[`tone${index}`]}`} aria-hidden="true"><Icon size={56} strokeWidth={1.2} /><span>0{index + 2}</span></div><div className={styles.articleCopy}><span className={styles.tag}>{post.category}</span><h3>{post.title}</h3><p>{post.excerpt}</p><div className={styles.cardBottom}><span>{post.readingTime} min read</span><ArrowRight size={18} /></div></div></Link>})}</div>
      </section>
      <section className={styles.container}><div className={styles.cta}><div><p className={styles.eyebrow}>PUT IT INTO PRACTICE</p><h2>Your next listing starts here.</h2><p>Sign in to prepare products and manage your store.</p></div><Link className={styles.primary} href="/login">Go to your portal <ArrowRight size={17} /></Link></div></section>
    </main><LandingFooter />
  </div>
}
