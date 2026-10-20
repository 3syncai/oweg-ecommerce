"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowUpRight, Package, Layers3, Truck, Wallet, ShieldCheck, Store, FileSpreadsheet, Check, ChevronDown, BarChart3 } from "lucide-react"
import LandingHeader from "@/components/LandingHeader"
import LandingFooter from "@/components/LandingFooter"
import styles from "./SellerLanding.module.css"

const tools = [
  { icon: Package, title: "A catalogue that works for you", description: "Add product details, images and variants. Organise your listings by brand and category.", detail: "Products & variants" },
  { icon: FileSpreadsheet, title: "More products, less repetition", description: "Upload your Excel sheet, review calculated listing prices and add your brand letters before submitting.", detail: "Bulk listing" },
  { icon: Truck, title: "Keep every order moving", description: "Follow orders from acceptance to dispatch and delivery, with shipping details in one place.", detail: "Orders & fulfilment" },
  { icon: Layers3, title: "Stay on top of your stock", description: "Review product inventory and update quantities as your store changes.", detail: "Inventory management" },
  { icon: Wallet, title: "Understand your earnings", description: "Review payment records, commissions and settlement details in your vendor portal.", detail: "Payments & settlements" },
  { icon: BarChart3, title: "See your store at a glance", description: "Bring products, orders and store activity together in a dashboard for everyday decisions.", detail: "Store dashboard" },
]
const steps = [
  { number: "01", title: "Make it your store", description: "Create a vendor account and add your business, store and verification details." },
  { number: "02", title: "Bring your catalogue", description: "Add products one at a time or use Excel. Complete your photos, pricing and brand documents." },
  { number: "03", title: "Get ready for orders", description: "Submit your listings for review. Once approved, manage your selling activity from the portal." },
]
const questions = [
  { title: "What should I keep ready before signing up?", answer: "Keep your business and contact details, store address, verification documents and bank information ready. When listing products, include photos, base prices, stock and packed dimensions and weight." },
  { title: "Can I list several products together?", answer: "Yes. Download the Excel template in Products > Bulk Upload, fill in your product details, then upload it. You can review listing prices, photos and brand authorization letters before submitting." },
  { title: "When will my products appear on OWEG?", answer: "Your vendor account, product listings and any required brand documents go through admin review. Approved listings can then appear on the storefront. You can follow their status in the vendor portal." },
  { title: "I already have a vendor account. Where do I go?", answer: "Choose Sign in to return to your vendor portal. Your products, orders, store profile and payment details are available there." },
]

export default function HomePage() {
  return <div className={styles.page}>
    <a href="#seller-main" className={styles.skipLink}>Skip to content</a>
    <LandingHeader />
    <main id="seller-main">
      <section className={styles.hero} aria-labelledby="seller-hero-title">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}><span /> OWEG VENDOR PORTAL</p>
            <h1 id="seller-hero-title">Start selling.<br />Make it <span>your OWEG store.</span></h1>
            <p className={styles.heroDescription}>Bring your products to OWEG. Manage your catalogue, orders, inventory and payments from one place.</p>
            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.primaryAction}>Start selling <ArrowRight size={18} /></Link>
              <Link href="/login" className={styles.secondaryAction}>Seller sign in <ArrowUpRight size={17} /></Link>
            </div>
            <div className={styles.heroNotes}><span><Check size={15} /> Excel bulk uploads</span><span><Check size={15} /> Product & order management</span></div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.orbitOne} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
            <Image src="/Oweg3d-400.png" alt="OWEG shopping bag brand mark" width={500} height={500} priority className={styles.heroLogo} />
            <div className={styles.storeLabel}><span><Store size={19} /></span><div><strong>Your business, connected.</strong><small>One place for everyday selling</small></div></div>
            <div className={styles.visualTag}><ShieldCheck size={16} /> Built for your vendor workspace</div>
          </div>
        </div>
        <div className={styles.heroBottom}><span>FROM YOUR FIRST LISTING TO EVERYDAY ORDERS</span><div><span>List</span><i /><span>Manage</span><i /><span>Grow</span></div></div>
      </section>

      <section className={styles.featureStrip} aria-label="Vendor portal features">
        {[{icon:Store,title:"Your store",text:"Your brand on OWEG"},{icon:FileSpreadsheet,title:"Your catalogue",text:"Individual & bulk listing"},{icon:Truck,title:"Your orders",text:"From acceptance to delivery"},{icon:Wallet,title:"Your earnings",text:"Payments in one place"}].map(({icon:Icon,title,text})=><div key={title}><Icon size={21} strokeWidth={1.6} /><div><strong>{title}</strong><span>{text}</span></div></div>)}
      </section>

      <section className={styles.toolsSection} aria-labelledby="seller-tools-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR DAILY WORKSPACE</p><h2 id="seller-tools-title">Less switching.<br />More time for your business.</h2></div><p>From preparing your catalogue to tracking payments, keep the details of your store together.</p></div>
        <div className={styles.toolsGrid}>{tools.map(({icon:Icon,title,description,detail},index)=><article key={title} className={styles.toolCard}><div className={styles.cardTop}><span className={styles.toolIcon}><Icon size={23} strokeWidth={1.6} /></span><span className={styles.toolNumber}>0{index+1}</span></div><p className={styles.toolDetail}>{detail}</p><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className={styles.startSection} aria-labelledby="seller-start-title">
        <div className={styles.startIntro}><p className={styles.eyebrow}>GETTING STARTED</p><h2 id="seller-start-title">A clear path<br />to your first listing.</h2><p>Set up your account, build your catalogue and submit it for review.</p><Link href="/signup" className={styles.inlineLink}>Create your vendor account <ArrowUpRight size={17} /></Link></div>
        <ol className={styles.steps}>{steps.map(step=><li key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
      </section>

      <section className={styles.faqSection} aria-labelledby="seller-faq-title"><div><p className={styles.eyebrow}>A LITTLE HELP BEFORE YOU START</p><h2 id="seller-faq-title">Good questions.<br />Clear answers.</h2><p>Already selling with us?<br /><Link href="/login" className={styles.inlineLink}>Sign in to your account <ArrowRight size={16} /></Link></p></div><div className={styles.questions}>{questions.map(question=><details key={question.title}><summary>{question.title}<ChevronDown size={18} /></summary><p>{question.answer}</p></details>)}</div></section>

      <section className={styles.cta} aria-labelledby="seller-cta-title"><div><p className={styles.heroEyebrow}>YOUR NEXT CHAPTER STARTS HERE</p><h2 id="seller-cta-title">Let’s get your store ready.</h2><p>Create your vendor account and start building your catalogue.</p></div><Link href="/signup" className={styles.primaryAction}>Become an OWEG seller <ArrowRight size={18} /></Link></section>
    </main>
    <LandingFooter />
  </div>
}
