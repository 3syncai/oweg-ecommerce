"use client";
import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { CART_FLIGHT_START, CART_FLIGHT_SETTLED, type CartFlight } from "@/lib/cart-flight";

type FlightState = { id: number; source: CartFlight; failed: boolean; done: () => void };
const cartImpacts = new WeakMap<HTMLElement, Animation>();
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
function confirmCartImpact() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = visibleCart();
  if (!target) return;
  cartImpacts.get(target)?.cancel();
  const impact = target.animate([
    { scale: "1" },
    { scale: "1.12", offset: .42 },
    { scale: "1" },
  ], { duration: 180, easing: "ease-out" });
  cartImpacts.set(target, impact);
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
    let dirty = false;
    let end = target.getBoundingClientRect();
    const from = source.element?.isConnected ? source.element.getBoundingClientRect() : source.from;
    const { left, top, width, height } = from;
    const startX = left + width / 2;
    const startY = top + height / 2;
    const right = end.left + end.width / 2 >= startX;
    const down = end.top + end.height / 2 >= startY;
    const originX = width / 2;
    const originY = height / 2;
    const restore = detach(source.element);
    const progress = { value: 0 };
    const updateTarget = () => { dirty = true; };
    const readTarget = () => {
      if (!dirty) return;
      target = visibleCart() ?? target;
      end = target!.getBoundingClientRect();
      dirty = false;
    };
    // Keep layout reads off the frame path unless the destination moved.
    const travel = () => {
      readTarget();
      const p = progress.value;
      const dx = end.left + end.width / 2 - startX;
      const dy = end.top + end.height / 2 - startY;
      const lift = Math.sin(Math.PI * p) * Math.min(64, Math.hypot(dx, dy) * .16);
      node.style.transform = `translate3d(${dx * p}px, ${dy * p - lift}px, 0)`;
    };
    const context = gsap.context(() => {
      gsap.set(node, { left, top, width, height, force3D: true });
      gsap.set(picture, { transformOrigin: `${originX}px ${originY}px`, transformPerspective: 700, force3D: true });
    });
    const finish = () => { if (!disposed) { restoreOnce(); done(); } };
    let restored = false;
    const restoreOnce = () => { if (!restored) { restored = true; restore(); } };
    const timeline = gsap.timeline({ onComplete: finish });
    const phase = (name: string) => { node.dataset.phase = name; };
    timeline.call(() => phase("detach"), [], 0)
      .to(picture, { scale: 1.025, z: 12, rotationX: down ? -7 : 7, duration: .12, ease: "power1.out" }, 0)
      .call(() => phase("bank"), [], .12)
      .to(picture, { scale: .82, z: 24, rotationY: right ? 24 : -24, rotationZ: right ? -7 : 7, duration: .18, ease: "power2.out" }, .12)
      .call(() => phase("shoot"), [], .30)
      .to(progress, { value: 1, duration: .50, ease: "power1.inOut", onUpdate: travel }, .30)
      .to(picture, { scale: .04, z: -32, rotationX: 0, rotationY: 0, rotationZ: 0, duration: .50, ease: "power1.inOut" }, .30)
      .to(picture, { opacity: 0, duration: .10, ease: "power1.in" }, .70);
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
    <img ref={image} src={source.src} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "contain", willChange: "transform, opacity" }} />
  </div>;
}
export default function CartSuccessMotion() {
  const [flights, setFlights] = useState<FlightState[]>([]);
  useEffect(() => {
    const active = new Map<number, boolean>();
    const start = (event: Event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const { id, source } = (event as CustomEvent<{ id: number; source: CartFlight }>).detail;
      if (active.size >= 4) {
        const oldest = active.keys().next().value;
        if (oldest !== undefined) active.delete(oldest);
      }
      active.set(id, false);
      const done = () => {
        if (active.get(id)) confirmCartImpact();
        active.delete(id);
        setFlights(current => current.filter(flight => flight.id !== id));
      };
      setFlights(current => [...current.slice(-3), { id, source, failed: false, done }]);
    };
    const settled = (event: Event) => {
      const { id, success } = (event as CustomEvent<{ id: number; success: boolean }>).detail;
      if (success) {
        if (active.has(id)) active.set(id, true);
        else confirmCartImpact();
      } else {
        active.delete(id);
        setFlights(current => current.map(flight => flight.id === id ? { ...flight, failed: true } : flight));
      }
    };
    window.addEventListener(CART_FLIGHT_START, start);
    window.addEventListener(CART_FLIGHT_SETTLED, settled);
    return () => { window.removeEventListener(CART_FLIGHT_START, start); window.removeEventListener(CART_FLIGHT_SETTLED, settled); };
  }, []);
  return flights.length ? createPortal(<div aria-hidden="true" data-cart-motion-layer style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 10000, contain: "strict" }}>{flights.map(flight => <Flight key={flight.id} {...flight} />)}</div>, document.body) : null;
}
