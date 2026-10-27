import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, KeyRound, Mail, ShieldCheck } from "lucide-react"
import styles from "./AccountRecovery.module.css"

export default function AccountRecoveryLayout({ children }: { children: ReactNode }) {
  return <div className={styles.page}>
    <div className={styles.shell}>
      <Link href="/login" className={styles.back}><ArrowLeft size={16} /> Back to sign in</Link>
      <div className={styles.card}>
        <section className={styles.formPanel}>{children}</section>
        <aside className={styles.story} aria-label="Account recovery help">
          <div className={styles.storyTop}><ShieldCheck size={19} /><span>YOUR OWEG ACCOUNT</span></div>
          <div className={styles.illustration} aria-hidden="true">
            <div className={styles.orbit} />
            <div className={styles.envelope}><Mail size={66} strokeWidth={1.2} /></div>
            <span className={styles.key}><KeyRound size={26} /></span>
            <span className={styles.verified}><ShieldCheck size={21} /></span>
          </div>
          <h2>A fresh start.<br /><span>Same everyday finds.</span></h2>
          <p>Your orders, favourites and account stay right where you left them.</p>
          <ol className={styles.steps}>
            <li><span>01</span> Get a link in your inbox</li>
            <li><span>02</span> Choose a new password</li>
            <li><span>03</span> Sign in and carry on</li>
          </ol>
          <Link href="/contact" className={styles.support}>Need a hand? Contact us <ArrowUpRight size={15} /></Link>
        </aside>
      </div>
    </div>
  </div>
}
