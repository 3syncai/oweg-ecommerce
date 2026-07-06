"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MobileBottomNav = dynamic(
  () => import("@/components/mobile/MobileBottomNav"),
  { ssr: false },
);

export default function MobileBottomNavShell() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (!isMobile) {
    return null;
  }

  return <MobileBottomNav />;
}
