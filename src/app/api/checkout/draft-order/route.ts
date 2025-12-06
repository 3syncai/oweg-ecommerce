// File path: src/app/api/checkout/draft-order/route.ts

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { convertDraftOrder, createDraftOrder, readStoreCart } from "@/lib/medusa-admin";

export const dynamic = "force-dynamic";

const DEFAULT_COUNTRY = "IN";

type AddressInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
};

type DraftRequestBody = {
  shipping: AddressInput;
  billing?: AddressInput;
  billingSameAsShipping?: boolean;
  shippingMethod?: string;
  referralCode?: string;
  paymentMethod?: "razorpay" | "cod";
  itemsOverride?: Array<{ variant_id: string; quantity: number }>;
  mode?: "buy_now" | "cart";
};

function mapAddress(input?: AddressInput) {
  if (!input) return undefined;
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    address_1: input.address1,
    address_2: input.address2,
    city: input.city,
    province: input.state,
    postal_code: input.postalCode,
    country_code: (input.countryCode || DEFAULT_COUNTRY).toLowerCase(),
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

type DraftOrder = {
  id?: string;
  currency_code?: string;
  total?: number;
};

function extractOrder(data: unknown): DraftOrder | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.draft_order || root.order;
  if (direct && typeof direct === "object") return direct as DraftOrder;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as DraftOrder;
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as DraftOrder;
    }
  }
  return root as DraftOrder;
}

function extractMessage(data: unknown): string | null {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const msg = record.message || record.error;
    if (typeof msg === "string") return msg;
  }
  return null;
}

const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID;
const REGION_ID =
  process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || process.env.MEDUSA_REGION_ID;
const BACKEND_BASE =
  (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_API_KEY;

async function backend(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (PUBLISHABLE_KEY) headers["x-publishable-api-key"] = PUBLISHABLE_KEY;
  if (SALES_CHANNEL_ID) headers["x-sales-channel-id"] = SALES_CHANNEL_ID;
  return fetch(`${BACKEND_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...headers, ...(init?.headers as HeadersInit) },
  });
}

async function createTempCart() {
  const payload: Record<string, string> = {};
  if (SALES_CHANNEL_ID) payload.sales_channel_id = SALES_CHANNEL_ID;
  if (REGION_ID) payload.region_id = REGION_ID;
  const res = await backend("/store/carts", {
    method: "POST",
    ...(Object.keys(payload).length ? { body: JSON.stringify(payload) } : {}),
  });
  if (!res.ok) throw new Error("Failed to create temp cart");
  const json = await res.json();
  const id = json.cart?.id || json.id;
  if (!id) throw new Error("Cart id missing");
  return { id, cart: json.cart || json };
}

async function addItemToCart(cartId: string, item: { variant_id: string; quantity: number }) {
  const res = await backend(`/store/carts/${encodeURIComponent(cartId)}/line-items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text) as { message?: string; code?: string; type?: string };
      message = json.message || message;
      if (json.code) message = `${json.code}: ${message}`;
    } catch {
      // keep raw text
    }
    const err = new Error(message);
    throw err;
  }
  return res.json();
}

export async function POST(req: Request) {
  try {
    // parse body safely
    const body = (await req.json().catch(() => ({}))) as DraftRequestBody;
    const shipping = body.shipping;

    // basic validation
    if (!shipping?.email || !shipping.firstName || !shipping.address1 || !shipping.postalCode) {
      return badRequest("Missing required shipping fields");
    }

    const headerList = await headers();
    const cookieStore = await cookies();

    const itemsOverride =
      Array.isArray(body.itemsOverride) && body.itemsOverride.length
        ? body.itemsOverride
            .filter((it) => it?.variant_id && Number(it.quantity) > 0)
            .map((it) => ({
              variant_id: it.variant_id,
              quantity: Math.max(1, Number(it.quantity)),
            }))
        : null;

    let cart: Record<string, unknown> | null = null;
    let cartId: string | undefined;

    if (itemsOverride) {
      // buy-now: create isolated temp cart to avoid mutating user cart
      try {
        const temp = await createTempCart();
        cartId = temp.id;
        for (const item of itemsOverride) {
          await addItemToCart(temp.id, item);
        }
        const refreshed = await backend(`/store/carts/${encodeURIComponent(temp.id)}`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          cart = (data.cart as Record<string, unknown>) || (data as Record<string, unknown>);
        } else {
          cart = temp.cart;
        }
      } catch (err) {
        console.error("buy-now cart build failed", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Unable to prepare item for checkout";
        return badRequest(message);
      }
    } else {
      const guestCartId = headerList.get("x-guest-cart-id");
      cartId = guestCartId || cookieStore.get("cart_id")?.value;
      if (!cartId) {
        return badRequest("Cart not found");
      }
      const cartData = await readStoreCart(cartId);
      if (!cartData?.cart) {
        return badRequest("Cart is empty or unavailable");
      }
      cart = cartData.cart as Record<string, unknown>;
    }

    if (!cart) {
      return badRequest("Cart is empty or unavailable");
    }

    const items = Array.isArray(cart.items)
      ? cart.items.map((item: unknown) => {
          const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          const variantObj = record.variant as Record<string, unknown> | undefined;
          const variantId =
            (typeof record.variant_id === "string" && record.variant_id) ||
            (variantObj && typeof variantObj.id === "string" && variantObj.id) ||
            (typeof record.id === "string" && record.id) ||
            undefined;
          const quantityRaw =
            typeof record.quantity === "number"
              ? record.quantity
              : Number.isFinite(Number(record.quantity))
                ? Number(record.quantity)
                : 1;
          const quantity = Math.max(1, quantityRaw);
          return {
            variant_id: variantId,
            quantity,
          };
        })
      : [];

    if (!items.length) {
      return badRequest("Cart has no items");
    }

    const billing =
      body.billingSameAsShipping || !body.billing ? mapAddress(shipping) : mapAddress(body.billing);

    const paymentMethod = body.paymentMethod || "razorpay";

    const regionId = typeof cart.region_id === "string" ? cart.region_id : undefined;
    const cartCurrency = typeof cart.currency_code === "string" ? cart.currency_code : undefined;

    const payload = {
      region_id: regionId,
      email: shipping.email,
      currency_code: cartCurrency,
      billing_address: billing,
      shipping_address: mapAddress(shipping),
      items,
      metadata: {
        cart_id: cartId,
        referral_code: body.referralCode || null,
        shipping_method: body.shippingMethod || null,
        payment_method: paymentMethod,
        mode: body.mode || (itemsOverride ? "buy_now" : "cart"),
      },
    };

    const draftRes = await createDraftOrder(payload);
    if (!draftRes.ok || !draftRes.data) {
      const error = extractMessage(draftRes.data) || "Failed to create draft order";
      if ((draftRes.status as number) === 401) {
        return NextResponse.json({ error: "Unauthorized: check MEDUSA_ADMIN_API_KEY on frontend server" }, { status: 401 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }

    const draftOrder = extractOrder(draftRes.data);
    if (!draftOrder?.id) {
      return NextResponse.json({ error: "Draft order missing id" }, { status: 500 });
    }

    let medusaOrderId = draftOrder.id;
    let medusaCurrency = draftOrder.currency_code || cartCurrency;
    let medusaTotal = draftOrder.total;
    let converted = false;

    if (paymentMethod === "razorpay") {
      const convertedRes = await convertDraftOrder(draftOrder.id);
      if (convertedRes.ok) {
        const convertedOrder = convertedRes.data ? extractOrder(convertedRes.data) : null;
        if (convertedOrder?.id) {
          medusaOrderId = convertedOrder.id;
          medusaCurrency = convertedOrder.currency_code || medusaCurrency;
          medusaTotal = convertedOrder.total ?? medusaTotal;
          converted = true;
        }
      }
    }

    return NextResponse.json({
      medusaOrderId,
      total: medusaTotal,
      currency_code: medusaCurrency,
      cartId,
      draft: !converted,
    });
  } catch (err) {
    console.error("draft-order error", err);
    return NextResponse.json({ error: "Unable to create draft order" }, { status: 500 });
  }
}
