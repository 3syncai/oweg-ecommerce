import { ArrowRight, HandHeart, MapPin, PhoneCall, Users } from "lucide-react";
import Link from "next/link";
import styles from "./AgentRegistration.module.css";

const highlights = [
  { title: "Hyperlocal leads", copy: "Get orders from nearby pin codes and earn on every fulfilled delivery.", icon: MapPin },
  { title: "Assist & earn", copy: "Help shoppers pick the right appliance; earn referral rewards instantly.", icon: HandHeart },
  { title: "Fast support", copy: "Dedicated ops manager + WhatsApp group for escalations.", icon: PhoneCall },
];

export default function AgentRegistrationPage() {
  return (
    <div className={styles.page}>
      <div className={`oweg-container ${styles.container}`}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}><Users size={16} aria-hidden="true" /> Agent / Partner Track</span>
            <h1>Grow with OWEG as a <span>Partner.</span></h1>
            <p className={styles.lead}>
              Guide shoppers, collect orders, and assist with doorstep deliveries. We handle catalog, pricing, and payouts.
            </p>
            <div className={styles.heroActions}>
              <Link href="mailto:partners@oweg.in?subject=Join%20OWEG%20as%20Agent" className={styles.applyLink}>
                Apply now <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <span className={styles.emailNote}>Apply by email · partners@oweg.in</span>
            </div>
          </div>
          <div className={styles.community} aria-hidden="true">
            <div className={styles.network}>
              <div className={styles.orbit} />
              <span className={`${styles.networkNode} ${styles.peopleNode}`}><Users size={25} /></span>
              <span className={styles.networkCenter}><MapPin size={46} strokeWidth={1.5} /></span>
              <span className={`${styles.networkNode} ${styles.helpNode}`}><HandHeart size={25} /></span>
              <span className={styles.networkLabel}>Closer to your community</span>
            </div>
            <div className={styles.managedLabel}>We take care of the details</div>
            <div className={styles.managedTags}><span>Catalog</span><span>Pricing</span><span>Payouts</span></div>
          </div>
        </header>

        <section aria-labelledby="benefits-heading" className={styles.benefits}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionEyebrow}>A partnership that works for you</p>
            <h2 id="benefits-heading">Local connections. New opportunities.</h2>
          </div>
          <div className={styles.benefitGrid}>
            {highlights.map((item) => (
              <article key={item.title} className={styles.benefitCard}>
                <span className={styles.benefitIcon}><item.icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
                <div><h3>{item.title}</h3><p>{item.copy}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="onboarding-heading" className={styles.onboarding}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionEyebrow}>How it works</p>
            <h2 id="onboarding-heading">Your next chapter, in three steps.</h2>
          </div>
          <ol className={styles.steps}>
            {["Submit your pin codes + KYC", "Join our onboarding sprint (60 mins)", "Start earning on orders + support"].map((step, index) => (
              <li key={step}><span className={styles.stepNumber}>0{index + 1}</span><h3>{step}</h3></li>
            ))}
          </ol>
          <p className={styles.dashboardNote}>
            You’ll get a dashboard to track referrals, delivery status, and payouts—plus scripts to help shoppers pick the right product.
          </p>
        </section>

        <section className={styles.invitation} aria-labelledby="apply-heading">
          <div><h2 id="apply-heading">Ready to grow with OWEG?</h2><p>Get in touch with our partner team to get started.</p></div>
          <Link href="mailto:partners@oweg.in?subject=Join%20OWEG%20as%20Agent" className={styles.applyLink}>
            Apply now <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
