"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
// Keep dock styles in the persistent layout during client-side navigation.
import "./MobileBottomNav.module.css";

const MobileBottomNav = dynamic(
  () => import("@/components/mobile/MobileBottomNav"),
  { ssr: false },
);

export default function MobileBottomNavShell() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsMobile(!media.matches);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (!isMobile) {
    return null;
  }

  return <MobileBottomNav />;
}
