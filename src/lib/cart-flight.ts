export type CartFlight = {
  src: string;
  element?: HTMLImageElement;
  from: { left: number; top: number; width: number; height: number };
};
export function captureCartFlight(container: Element | null): CartFlight | undefined {
  const image = container?.querySelector<HTMLImageElement>("img");
  if (!image || (image.complete && !image.naturalWidth)) return;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return;
  return { element: image, src: image.currentSrc || image.src, from: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
}
export const CART_FLIGHT_START = "oweg:cart-flight-start";
export const CART_FLIGHT_SETTLED = "oweg:cart-flight-settled";
let sequence = 0;
export function beginCartFlight(source?: CartFlight): number | undefined {
  if (!source || typeof window === "undefined") return;
  const id = ++sequence;
  window.dispatchEvent(new CustomEvent(CART_FLIGHT_START, { detail: { id, source } }));
  return id;
}
export function settleCartFlight(id: number | undefined, success: boolean) {
  if (id !== undefined && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_FLIGHT_SETTLED, { detail: { id, success } }));
  }
}
