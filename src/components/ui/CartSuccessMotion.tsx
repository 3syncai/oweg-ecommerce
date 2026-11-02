"use client";
import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { CART_FLIGHT_START, CART_FLIGHT_SETTLED, type CartFlight } from "@/lib/cart-flight";

type FlightState = { id: number; source: CartFlight; failed: boolean; done: () => void };
const cartImpacts = new WeakMap<HTMLElement, gsap.core.Timeline>();
const hiddenImages = new WeakMap<HTMLImageElement, { count: number; visibility: string }>();
function detach(image?: HTMLImageElement) {
  if (!image) return () => {};
  const entry = hiddenImages.get(image) ?? { count: 0, visibility: image.style.visibility };
  entry.count++;
  hiddenImages.set(image, entry);
  image.style.visibility = "hidden";
  return () => {
    entry.count--;
    if (entry.count === 0) { image.style.visibility = entry.visibility; hiddenImages.delete(image); }
  };
}
function visibleCart() {
  return [...document.querySelectorAll<HTMLElement>("[data-cart-target]")].find(node => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && getComputedStyle(node).visibility !== "hidden";
  });
}
function Flight({ source, failed, done }: FlightState) {
  const wrapper = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const cancel = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const node = wrapper.current;
    const picture = image.current;
    let target = visibleCart();
    if (!node || !picture || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    let disposed = false;
    let dirty = true;
    let end = target.getBoundingClientRect();
    const from = source.element?.isConnected ? source.element.getBoundingClientRect() : source.from;
    const { left, top, width, height } = from;
    const startX = left + width / 2;
    const startY = top + height / 2;
    const right = end.left + end.width / 2 >= startX;
    const down = end.top + end.height / 2 >= startY;
    const originX = right ? width : 0;
    const originY = down ? height : 0;
    const restore = detach(source.element);
    const progress = { value: 0 };
    const updateTarget = () => { dirty = true; };
    const readTarget = () => {
      if (!dirty) return;
      target = visibleCart() ?? target;
      end = target!.getBoundingClientRect();
      dirty = false;
    };
    const travel = () => {
      readTarget();
      const p = progress.value;
      const dx = end.left + end.width / 2 - (left + originX + (width / 2 - originX) * .02);
      const dy = end.top + end.height / 2 - (top + originY + (height / 2 - originY) * .02);
      gsap.set(node, { x: dx * p, y: dy * p - Math.sin(Math.PI * p) * Math.min(60, Math.abs(dy) * .15), force3D: true });
    };
    const context = gsap.context(() => {
      gsap.set(node, { left, top, width, height, force3D: true });
      gsap.set(picture, { transformOrigin: `${originX}px ${originY}px`, force3D: true });
    });
    const finish = () => { if (!disposed) { restoreOnce(); done(); } };
    let restored = false;
    const restoreOnce = () => { if (!restored) { restored = true; restore(); } };
    let impact: gsap.core.Timeline | undefined;
    let impactTarget: HTMLElement | undefined;
    const timeline = gsap.timeline({ onComplete: finish });
    const phase = (name: string) => { node.dataset.phase = name; };
    timeline.call(() => phase("detach"), [], 0)
      .to(picture, { scaleX: 1.04, scaleY: .94, rotation: right ? -3 : 3, duration: .12, ease: "power1.out" }, 0)
      .call(() => phase("diamond"), [], .12)
      .to(picture, { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", scaleX: 1.12, scaleY: .24, skewX: right ? -20 : 20, rotation: right ? -18 : 18, duration: .21, ease: "power2.inOut" }, .12)
      .call(() => phase("compress"), [], .33)
      .to(picture, { scaleX: .22, scaleY: .09, skewX: 0, rotation: 0, duration: .13, ease: "power2.in" }, .33)
      .call(() => phase("shoot"), [], .46)
      .to(progress, { value: 1, duration: .55, ease: "power1.inOut", onUpdate: travel }, .46)
      .to(picture, { scaleX: .02, scaleY: .02, duration: .55, ease: "power2.in" }, .46)
      .to(picture, { opacity: 0, duration: .14, ease: "power2.in" }, .87)
      .call(() => {
        phase("impact");
        restoreOnce();
        readTarget();
        if (!target?.isConnected) return;
        // Decorative catch/squash, not a claim that the API succeeded.
        impactTarget = target;
        cartImpacts.get(target)?.revert();
        impact = gsap.timeline().to(target, { scaleX: 1.16, scaleY: .8, y: 2, duration: .045, ease: "power2.out" })
          .to(target, { scaleX: 1, scaleY: 1, y: 0, duration: .075, ease: "back.out(2)" });
        cartImpacts.set(target, impact);
      }, [], 1.01)
      .to({}, { duration: .12 }, 1.01);
    window.addEventListener("scroll", updateTarget, { passive: true, capture: true });
    window.addEventListener("resize", updateTarget, { passive: true });
    window.visualViewport?.addEventListener("resize", updateTarget);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preferenceChanged = () => { if (motionPreference.matches) { cancel.current(); done(); } };
    motionPreference.addEventListener("change", preferenceChanged);
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      timeline.kill();
      motionPreference.removeEventListener("change", preferenceChanged);
      if (impactTarget && cartImpacts.get(impactTarget) === impact) {
        impact?.revert();
        cartImpacts.delete(impactTarget);
      }
      context.revert();
      restoreOnce();
      window.removeEventListener("scroll", updateTarget, true);
      window.removeEventListener("resize", updateTarget);
      window.visualViewport?.removeEventListener("resize", updateTarget);
    };
    cancel.current = cleanup;
    return cleanup;
  }, [source, done]);
  useLayoutEffect(() => { if (failed) { cancel.current(); done(); } }, [failed, done]);
  return <div ref={wrapper} data-cart-flight style={{ position: "absolute", left: source.from.left, top: source.from.top, width: source.from.width, height: source.from.height, willChange: "transform", contain: "layout style" }}>
    {/* Decorative clone: no focus, hit testing or new layout space. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} src={source.src} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "contain", willChange: "transform, opacity", clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)" }} />
  </div>;
}
export default function CartSuccessMotion() {
  const [flights, setFlights] = useState<FlightState[]>([]);
  useEffect(() => {
    const start = (event: Event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const { id, source } = (event as CustomEvent<{ id: number; source: CartFlight }>).detail;
      const done = () => setFlights(current => current.filter(flight => flight.id !== id));
      setFlights(current => [...current.slice(-3), { id, source, failed: false, done }]);
    };
    const settled = (event: Event) => {
      const { id, success } = (event as CustomEvent<{ id: number; success: boolean }>).detail;
      if (!success) setFlights(current => current.map(flight => flight.id === id ? { ...flight, failed: true } : flight));
    };
    window.addEventListener(CART_FLIGHT_START, start);
    window.addEventListener(CART_FLIGHT_SETTLED, settled);
    return () => { window.removeEventListener(CART_FLIGHT_START, start); window.removeEventListener(CART_FLIGHT_SETTLED, settled); };
  }, []);
  return flights.length ? createPortal(<div aria-hidden="true" data-cart-motion-layer style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 10000, contain: "strict" }}>{flights.map(flight => <Flight key={flight.id} {...flight} />)}</div>, document.body) : null;
}
