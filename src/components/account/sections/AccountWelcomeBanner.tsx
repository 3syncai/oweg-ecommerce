import { Headphones } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { getCustomerDisplayName } from "@/lib/account-utils";
import styles from "../AccountOverview.module.css";

export default function AccountWelcomeBanner() {
  const { customer } = useAuth();
  const name = getCustomerDisplayName(customer);
  return (
      <header className={styles.heading}>
        <div>
          <h1>Your account</h1>
          <p className={styles.accountName}>{name}</p>
        </div>
        <Link href="/account/help" className={styles.helpLink}>
          <Headphones size={16} aria-hidden="true" /> Help &amp; Support
        </Link>
      </header>
  );
}
