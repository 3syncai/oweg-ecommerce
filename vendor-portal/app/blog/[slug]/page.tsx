import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"
import { sellerArticles } from "@/lib/seller-articles"
import styles from "../../SellerContent.module.css"

export function generateStaticParams() { return sellerArticles.map(({ slug }) => ({ slug })) }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = sellerArticles.find(post => post.slug === slug)
  return { title: article ? `${article.title} | OWEG Blog` : "Article not found | OWEG", description: article?.excerpt }
}
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = sellerArticles.find(post => post.slug === slug)
  if (!article) notFound()
  return <div className={styles.page}><a className={styles.skip} href="#main-content">Skip to content</a><LandingHeader /><main id="main-content">
    <section className={styles.articleHeader}><div className={styles.readingWidth}><Link className={styles.textLink} href="/blog"><ArrowLeft size={16} /> All seller guides</Link><p className={styles.eyebrow}>{article.category} · {article.readingTime} MIN READ</p><h1>{article.title}</h1><p className={styles.lead}>{article.excerpt}</p><span className={styles.byline}>OWEG seller guides</span></div></section>
    <article className={`${styles.readingWidth} ${styles.articleBody}`}>{article.sections.map((section, index) => <section key={section.title}><span className={styles.stepNumber}>0{index + 1}</span><h2>{section.title}</h2><p>{section.body}</p></section>)}<div className={styles.articleEnd}><h2>Ready to put it into practice?</h2><Link className={styles.primary} href="/login">Open your vendor portal <ArrowRight size={17} /></Link></div></article>
    <section className={`${styles.container} ${styles.guides}`}><p className={styles.eyebrow}>KEEP READING</p><h2>More for your store.</h2><div className={styles.cards}>{sellerArticles.filter(post => post.slug !== slug).map(post => <Link className={styles.card} key={post.slug} href={`/blog/${post.slug}`}><span className={styles.tag}>{post.category}</span><h3>{post.title}</h3><span className={styles.readLink}>Read guide <ArrowRight size={16} /></span></Link>)}</div></section>
  </main><LandingFooter /></div>
}
