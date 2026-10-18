"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { isStandalonePwa } from "@/lib/open-storefront-link";
import styles from "./AppLaunchSplash.module.css";

/** One launch treatment per document, never on ordinary client-side navigation. */
export default function AppLaunchSplash() {
  const [phase, setPhase] = useState<"launching" | "leaving" | "done">("launching");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (!isStandalonePwa()) {
      setPhase("done");
      return;
    }
    setInstalled(true);
    let finishing = false;
    let fadeTimer: ReturnType<typeof setTimeout>;
    let frame = 0;
    const finish = () => {
      if (finishing) return;
      finishing = true;
      setPhase("leaving");
      fadeTimer = setTimeout(() => setPhase("done"), 240);
    };
    const checkReady = () => {
      if (finishing) return;
      cancelAnimationFrame(frame);
      if (document.readyState === "loading") return;
      const content = document.querySelector("[data-storefront-content]");
      if (!content || content.querySelector("[data-brand-loading]")) return;
      // Allow the ready content to paint before uncovering it.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
    };
    const observer = new MutationObserver(checkReady);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", checkReady);
    checkReady();
    // A slow request must never trap the shopper behind the launch screen.
    const deadline = setTimeout(finish, 8000);
    return () => {
      observer.disconnect();
      document.removeEventListener("DOMContentLoaded", checkReady);
      clearTimeout(deadline);
      clearTimeout(fadeTimer);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (phase === "done") return null;
  return (
    <div className={styles.splash} data-installed={installed || undefined} data-leaving={phase === "leaving" || undefined} role="status" aria-label="Opening OWEG">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.brand} aria-hidden="true">
        <div className={styles.emblem}>
          <span className={styles.ripple} />
          <span className={styles.halo} />
          <span className={styles.tile}><span className={styles.mark} /></span>
          <span className={styles.sparkle} />
          <span className={styles.smallSparkle} />
        </div>
        <div className={styles.wordmarkReveal}>
          <Image src="/oweg_logo.png" alt="" width={170} height={45} priority className={styles.wordmark} />
        </div>
        <span className={styles.tagline}>A little more everyday.</span>
        <span className={styles.waiting}><i /><i /><i /></span>
      </div>
      <span className={styles.footer} aria-hidden="true">GOOD FINDS. EVERYDAY LIVING.</span>
    </div>
  );
}
