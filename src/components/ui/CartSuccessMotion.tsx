"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CART_CONFIRMED_EVENT, type CartFlight } from "@/lib/cart-flight";

function visibleCart() {
  return [...document.querySelectorAll<HTMLElement>("[data-cart-target]")].find(node => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && getComputedStyle(node).visibility !== "hidden";
  });
}
function Flight({ source, done }: { source?: CartFlight; done: () => void }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const target = visibleCart();
    const animations: Animation[] = [];
    let mounted = true;
    const finish = () => { if (mounted) done(); };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!target || reduced || typeof target.animate !== "function") { finish(); return; }
    const rect = target.getBoundingClientRect();
    const pulse = () => {
      if (!target.isConnected) return;
      const animation = target.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" });
      animations.push(animation);
      void animation.finished.then(finish, finish);
    };
    if (source && ref.current) {
      const startX = source.from.left + source.from.width / 2;
      const startY = source.from.top + source.from.height / 2;
      const dx = rect.left + rect.width / 2 - startX;
      const dy = rect.top + rect.height / 2 - startY;
      const animation = ref.current.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * .5}px,${dy * .5 - 40}px) scale(.65)`, opacity: .95, offset: .5 },
        { transform: `translate(${dx}px,${dy}px) scale(.1)`, opacity: .2 },
      ], { duration: 520, easing: "cubic-bezier(.2,.7,.25,1)" });
      animations.push(animation);
      void animation.finished.then(pulse, finish);
    } else pulse(); // Existing success toast is the non-image fallback.
    return () => { mounted = false; animations.forEach(animation => animation.cancel()); };
  }, [source, done]);
  if (!source) return null;
  // A decorative clone only. The real product image and cart remain interactive.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={source.src} alt="" aria-hidden="true" data-cart-flight style={{ position: "fixed", left: source.from.left + source.from.width / 2 - 32, top: source.from.top + source.from.height / 2 - 32, width: 64, height: 64, objectFit: "contain", borderRadius: 12, background: "white", boxShadow: "0 4px 16px #193c3030", pointerEvents: "none", zIndex: 10000 }} />;
}
export default function CartSuccessMotion() {
  const [flights, setFlights] = useState<Array<{ id: number; source?: CartFlight; done: () => void }>>([]);
  const sequence = useRef(0);
  useEffect(() => {
    const listener = (event: Event) => {
      const id = ++sequence.current;
      const source = (event as CustomEvent<CartFlight | undefined>).detail;
      const done = () => setFlights(current => current.filter(flight => flight.id !== id));
      setFlights(current => [...current.slice(-3), { id, source, done }]);
    };
    window.addEventListener(CART_CONFIRMED_EVENT, listener);
    return () => window.removeEventListener(CART_CONFIRMED_EVENT, listener);
  }, []);
  return flights.length ? createPortal(<>{flights.map(flight => <Flight key={flight.id} source={flight.source} done={flight.done} />)}</>, document.body) : null;
}
