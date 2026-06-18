"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function SmoothScrollInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor || anchor.hash.length <= 1) return;

      const id = decodeURIComponent(anchor.hash.slice(1));
      const section = document.getElementById(id);
      if (!section) return;

      event.preventDefault();
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    };

    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, []);

  return null;
}

export default function SmoothScroll() {
  return (
    <Suspense fallback={null}>
      <SmoothScrollInner />
    </Suspense>
  );
}
