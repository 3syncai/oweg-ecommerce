import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import Link from "next/link";
import styles from "../AccountOverview.module.css";

export default function AccountWelcomeBanner() {
  return (
      <header className={styles.heading}>
        <div>
          <p className={styles.headingLabel}>Account overview</p>
          <h1>Your account</h1>
        </div>
        <Link href="/account/help" className={styles.helpLink}>
          <AccountHubIcon name="help-and-support" size={16} /> Get help
        </Link>
      </header>
  );
}
