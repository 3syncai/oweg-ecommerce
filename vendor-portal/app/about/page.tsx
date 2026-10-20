import Link from "next/link"
import Image from "next/image"
import { ArrowRight, FileSpreadsheet, Package, ShieldCheck, Store, Wallet } from "lucide-react"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"
import styles from "../SellerContent.module.css"

export const metadata = { title: "About OWEG | A workspace for your business", description: "Discover the OWEG vendor workspace for products, inventory, orders and payments." }
const features = [
  { icon: Package, title: "Your catalogue, organised", text: "Keep product details, variants, photos and available stock together." },
  { icon: FileSpreadsheet, title: "Room for your next listing", text: "Start with a single product or bring a full Excel sheet. Review your listings before submitting." },
  { icon: Wallet, title: "A clearer view of payments", text: "Review payment records and settlement details alongside your selling activity." },
]
export default function AboutPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#main-content">Skip to content</a><LandingHeader />
    <main id="main-content">
      <section className={styles.hero}><div className={`${styles.container} ${styles.heroGrid}`}>
        <div><p className={styles.eyebrow}>ABOUT OWEG</p><h1>A place for products.<br /><span>A workspace for people.</span></h1><p className={styles.lead}>Behind every listing is a business. OWEG brings the everyday work of selling into one connected vendor portal.</p><Link className={styles.primary} href="/signup">Build your store <ArrowRight size={17} /></Link></div>
        <div className={styles.brandVisual}><Image src="/Oweg3d-400.png" alt="OWEG shopping bag symbol" width={400} height={400} priority /><div className={styles.visualNote}><Store size={22} /><div><strong>Your business, connected.</strong><span>Products. Orders. Everyday progress.</span></div></div></div>
      </div></section>
      <section className={`${styles.container} ${styles.section} ${styles.story}`}><div><p className={styles.eyebrow}>THE IDEA</p><h2>Less jumping between tasks.<br />More time for your store.</h2></div><div className={styles.prose}><p>Selling involves more than adding a product. There are photos to prepare, quantities to track, orders to fulfil and payment records to review.</p><p>The OWEG vendor portal brings those tasks together. From your first product to your next bulk upload, you have a shared place to manage the details.</p></div></section>
      <section className={styles.softSection}><div className={styles.container}><p className={styles.eyebrow}>BUILT AROUND YOUR DAY</p><h2>One store. A connected workflow.</h2><div className={styles.cards}>{features.map(({ icon: Icon, title, text }) => <div className={styles.card} key={title}><span className={styles.icon}><Icon size={23} /></span><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>
      <section className={`${styles.container} ${styles.section} ${styles.story}`}><div><span className={styles.icon}><ShieldCheck size={25} /></span><h2>Good details make a<br />better marketplace.</h2></div><div className={styles.prose}><p>Accurate product information, clear images and required brand documentation help customers understand what they are buying.</p><p>Vendor accounts and listings go through review. The portal keeps the status visible so you can see what needs attention before your products go live.</p><Link className={styles.textLink} href="/blog">Explore the seller guides <ArrowRight size={17} /></Link></div></section>
      <section className={styles.container}><div className={styles.cta}><div><p className={styles.eyebrow}>YOUR NEXT CHAPTER</p><h2>Make it your OWEG store.</h2><p>Bring your products. We will bring the workspace.</p></div><Link className={styles.primary} href="/signup">Start selling <ArrowRight size={17} /></Link></div></section>
    </main><LandingFooter />
  </div>
}
