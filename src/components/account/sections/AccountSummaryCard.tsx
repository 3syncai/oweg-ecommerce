"use client";

import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { formatAccountCurrency } from "@/lib/account-utils";
import { useAccountOrdersSummary } from "@/hooks/useAccountOrdersSummary";
import styles from "../AccountOverview.module.css";

export default function AccountSummaryCard() {
  const { totalSpent, loading, orders } = useAccountOrdersSummary();

  const currencyCode = orders[0]?.currency_code;

  return (
    <section className={styles.shoppingTotal}>
      <div className={styles.totalLabel}>
        <AccountHubIcon name="account-summary" size={18} className="h-[18px] w-[18px]" />
        <div><h2>Total spent</h2><p>Across your orders</p></div>
      </div>
      <p className={styles.totalValue}>{loading ? "…" : formatAccountCurrency(totalSpent, currencyCode)}</p>
    </section>
  );
}
