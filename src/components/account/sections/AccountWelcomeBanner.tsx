"use client";

import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import Link from "next/link";
import { useState } from "react";
import LogoutConfirmModal from "@/components/account/LogoutConfirmModal";
import styles from "../AccountOverview.module.css";

type AccountWelcomeBannerProps = {
  subtitle?: string;
};

export default function AccountWelcomeBanner({
  subtitle = "Your shopping, personal details, and account security.",
}: AccountWelcomeBannerProps) {
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <>
    <header className={styles.heading}>
        <div>
          <h1>Your account</h1>
          <p>{subtitle}</p>
        </div>
        <div className={styles.headingActions}>
          <Link href="/account/help" className={styles.helpLink}><AccountHubIcon name="help-and-support" size={16} /> Help & Support</Link>
          <button type="button" onClick={() => setLogoutOpen(true)} className={styles.signOut}><AccountHubIcon name="logout" size={16} /> Sign Out</button>
        </div>
    </header>
    <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </>
  );
}
