import styles from "./BrandLoader.module.css";

type BrandLoaderProps = {
  label?: string;
  compact?: boolean;
};

/** Mount only while work is pending; CSS delays the visual to avoid fast-load flashes. */
export default function BrandLoader({
  label = "Loading your next good find…",
  compact = false,
}: BrandLoaderProps) {
  return (
    <div className={`${styles.loader} ${compact ? styles.compact : styles.page}`} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.visual} aria-hidden="true">
        <span className={styles.perspective}><span className={styles.mark} /></span>
        <span className={styles.shadow} />
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
