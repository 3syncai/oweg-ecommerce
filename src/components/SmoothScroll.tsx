"use client";

import { useEffect } from "react";

export default function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let destination = 0;

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function advance() {
      const root = document.scrollingElement;
      if (!root || getComputedStyle(document.body).overflowY === "hidden") {
        stop();
        return;
      }
      destination = Math.min(destination, Math.max(0, root.scrollHeight - root.clientHeight));
      const distance = destination - window.scrollY;
      if (Math.abs(distance) < 1) {
        window.scrollTo({ top: destination, behavior: "instant" });
        stop();
        return;
      }
      const step = Math.sign(distance) * Math.max(1, Math.abs(distance) * 0.2);
      window.scrollTo({ top: window.scrollY + step, behavior: "instant" });
      frame = requestAnimationFrame(advance);
    }

    function onWheel(event: WheelEvent) {
      // Small pixel deltas already have native trackpad momentum.
      const discrete = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
        (Math.abs(event.deltaY) >= 80 && Number.isInteger(event.deltaY));
      if (
        reducedMotion.matches || !discrete || event.defaultPrevented ||
        !event.cancelable || event.ctrlKey || event.shiftKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) {
        stop();
        return;
      }

      for (const target of event.composedPath()) {
        if (target === document.body) break;
        if (!(target instanceof HTMLElement)) continue;
        if (target.matches("dialog, [role='dialog'], input, select, textarea") ||
          (target.scrollHeight > target.clientHeight &&
            /^(auto|scroll|overlay)$/.test(getComputedStyle(target).overflowY))) {
          stop();
          return;
        }
      }

      const root = document.scrollingElement;
      if (!root || getComputedStyle(document.body).overflowY === "hidden") {
        stop();
        return;
      }
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? root.clientHeight : 1;
      const next = Math.max(0, Math.min(root.scrollHeight - root.clientHeight,
        (frame ? destination : window.scrollY) + event.deltaY * multiplier));
      if (!frame && Math.abs(next - window.scrollY) < 1) return;
      event.preventDefault();
      destination = next;
      if (!frame) frame = requestAnimationFrame(advance);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);
    window.addEventListener("popstate", stop);
    reducedMotion.addEventListener("change", stop);
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("popstate", stop);
      reducedMotion.removeEventListener("change", stop);
    };
  }, []);

  return null;
}
