import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import styles from "./ShoppingSurface.module.css";

export default function ShoppingEmptyState({ icon: Icon, title, description }: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}><Icon size={25} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href="/" className={styles.primary}>Continue shopping <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}
