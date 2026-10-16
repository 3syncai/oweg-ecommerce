import Link from "next/link";
import styles from "./Shopping.module.css";

export default function PurchaseJourney({ current }: { current: "cart" | "checkout" }) {
  return <nav className={styles.journey} aria-label="Purchase progress">
    {current === "checkout" ? <Link href="/cart"><b>1</b> Cart</Link> : <span aria-current="step"><b>1</b> Cart</span>}
    <i aria-hidden="true" />
    <span aria-current={current === "checkout" ? "step" : undefined}><b>2</b> Checkout</span>
    <i aria-hidden="true" />
    <span><b>3</b> Confirmation</span>
  </nav>;
}
