export type CartFlight = {
  src: string;
  from: { left: number; top: number; width: number; height: number };
};
export const CART_CONFIRMED_EVENT = "oweg:cart-confirmed";
export function captureCartFlight(container: Element | null): CartFlight | undefined {
  const image = container?.querySelector<HTMLImageElement>("img");
  if (!image || (image.complete && !image.naturalWidth)) return;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return;
  return { src: image.currentSrc || image.src, from: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
}
export function cartConfirmed(source?: CartFlight) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_CONFIRMED_EVENT, { detail: source }));
}
