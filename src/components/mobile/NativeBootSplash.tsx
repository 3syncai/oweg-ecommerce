"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { capacitorPlugin, isNativeApp } from "@/lib/native-app";
import styles from "./NativeBootSplash.module.css";

type SplashPlugin = {
  hide: (options?: { fadeOutDuration?: number }) => Promise<void>;
};

const SESSION_KEY = "oweg.native.bootsplash.shown";

/**
 * Branded logo intro inside the Capacitor shell.
 * Native SplashScreen stays up until this mounts, then we fade both.
 */
export default function NativeBootSplash() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        void capacitorPlugin<SplashPlugin>("SplashScreen")?.hide({ fadeOutDuration: 200 });
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* sessionStorage may be unavailable */
    }
    setActive(true);

    const hideNative = window.setTimeout(() => {
      void capacitorPlugin<SplashPlugin>("SplashScreen")?.hide({ fadeOutDuration: 400 });
    }, 400);

    const done = window.setTimeout(() => setActive(false), 1600);
    return () => {
      window.clearTimeout(hideNative);
      window.clearTimeout(done);
    };
  }, []);

  if (!active) return null;

  return (
    <div className={styles.overlay} aria-hidden>
      <div className={styles.mark}>
        <Image
          src="/icons/brand/oweg-wordmark.svg"
          alt=""
          width={140}
          height={40}
          priority
          unoptimized
        />
      </div>
    </div>
  );
}
