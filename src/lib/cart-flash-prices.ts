import { createFlashSaleCache, type FlashSalePayload } from "@/lib/flash-sale-cache";
import { applyFlashSalePricesToCart } from "@/lib/flash-sale-cart-mapper";

const cachedSale = createFlashSaleCache();
export async function cartFlashSale() {
  return cachedSale(async () => {
    const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
    const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY || "";
    const response = await fetch(`${base}/store/flash-sale/products`, {
      cache: "no-store", headers: { "x-publishable-api-key": key }, signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("flash_sale_unavailable");
    return await response.json() as FlashSalePayload;
  });
}

// Use the same displayed prices after GET, add, quantity change and removal.
export async function priceCartPayload<T extends { cart?: unknown }>(data: T): Promise<T> {
  try {
    const cart = data.cart as Parameters<typeof applyFlashSalePricesToCart>[0];
    if (cart?.items?.length) {
      return { ...data, cart: applyFlashSalePricesToCart(cart, await cartFlashSale() as Parameters<typeof applyFlashSalePricesToCart>[1]) };
    }
  } catch { /* Preserve the upstream cart when sale lookup is unavailable. Checkout verifies prices again. */ }
  return data;
}
