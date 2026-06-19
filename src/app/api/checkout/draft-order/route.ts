// File path: src/app/api/checkout/draft-order/route.ts
// FORCE REBUILD 1


import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createDraftOrder, readStoreCart } from "@/lib/medusa-admin";
import {
  runPostConvertCheckoutSideEffects,
  updateCheckoutOrderMetadata,
} from "@/lib/checkout-order";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { calculateOweg10Discount, OWEG10_CODE } from "@/lib/oweg10-shared";
import { calculateStatewiseShipping } from "@/lib/shipping-rules";
import { cartLineAmountRupees } from "@/lib/cart-helpers";
import { applyFlashSalePricesToCart } from "@/lib/flash-sale-cart-mapper";
import { findSpendByReference } from "@/lib/wallet-ledger";
import {
  consumeOweg10Reservation,
  releaseOweg10Reservation,
  reserveOweg10,
  syncOweg10ConsumedCustomerMetadata,
} from "@/lib/oweg10";
import { syncOrderTaxInclusivePricing } from "@/lib/order-discount";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";

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
  shippingPrice?: number;
  shippingMethodName?: string;
  coinDiscount?: number; // Coin discount in rupees
  coinDiscountCode?: string;
  oweg10Applied?: boolean;
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

function cartItemLineTotalRupees(record: Record<string, unknown>, currencyCode: string): number {
  return cartLineAmountRupees(record, currencyCode);
}

async function enrichCartWithFlashSale(cart: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const flashRes = await backend("/store/flash-sale/products");
    if (!flashRes.ok) return cart;
    const flashSaleData = await flashRes.json();
    return applyFlashSalePricesToCart(
      cart as Parameters<typeof applyFlashSalePricesToCart>[0],
      flashSaleData as Parameters<typeof applyFlashSalePricesToCart>[1]
    ) as Record<string, unknown>;
  } catch {
    return cart;
  }
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
const DEFAULT_SHIPPING_OPTION_ID =
  process.env.MEDUSA_DEFAULT_SHIPPING_OPTION_ID ||
  process.env.NEXT_PUBLIC_MEDUSA_DEFAULT_SHIPPING_OPTION_ID;

let cachedShippingOptionId: string | undefined;
let cachedShippingOptionAt = 0;
const SHIPPING_OPTION_CACHE_MS = 5 * 60 * 1000;

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

async function getFallbackRegionId() {
  if (REGION_ID) return REGION_ID;
  try {
    const res = await backend("/store/regions");
    if (res.ok) {
      const data = await res.json();
      if (data.regions && data.regions.length > 0) {
        return data.regions[0].id;
      }
    }
  } catch (e) {
    console.error("Failed to fetch regions", e);
  }
  return undefined;
}

async function createTempCart() {
  const payload: Record<string, string> = {};
  if (SALES_CHANNEL_ID) payload.sales_channel_id = SALES_CHANNEL_ID;

  const regionId = await getFallbackRegionId();
  if (regionId) payload.region_id = regionId;

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

async function getFirstShippingOptionId(cartId: string): Promise<string | undefined> {
  try {
    const res = await backend(`/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { shipping_options?: Array<{ id?: string }> };
    const optionId = data.shipping_options?.find((option) => typeof option?.id === "string")?.id;
    return optionId;
  } catch (error) {
    console.warn("Unable to resolve shipping option for cart", cartId, error);
    return undefined;
  }
}

async function resolveShippingOptionId(
  cartId: string | undefined,
  fromCart?: string
): Promise<string | undefined> {
  if (fromCart) return fromCart;
  if (DEFAULT_SHIPPING_OPTION_ID) return DEFAULT_SHIPPING_OPTION_ID;
  if (cachedShippingOptionId && Date.now() - cachedShippingOptionAt < SHIPPING_OPTION_CACHE_MS) {
    return cachedShippingOptionId;
  }
  if (!cartId) return undefined;

  const optionId = await getFirstShippingOptionId(cartId);
  if (optionId) {
    cachedShippingOptionId = optionId;
    cachedShippingOptionAt = Date.now();
  }
  return optionId;
}

async function getAuthenticatedCustomer(cookieHeader?: string) {
  if (!cookieHeader) return null;

  const res = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie: cookieHeader,
    headers: { cookie: cookieHeader },
    skipContentType: true,
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const customer =
    ((data as { customer?: Record<string, unknown> }).customer || data) as Record<string, unknown>;
  return typeof customer?.id === "string" ? customer : null;
}

export async function POST(req: Request) {
  let oweg10ReservationToken: string | null = null;
  let oweg10CustomerId: string | null = null;
  let oweg10Consumed = false;
  try {
    // parse body safely
    const body = (await req.json().catch(() => ({}))) as DraftRequestBody;
    const shipping = body.shipping;

    console.log("🛒 [Checkout Debug] Incoming Request:", {
      mode: body.mode,
      hasItemsOverride: !!body.itemsOverride,
      itemsOverrideCount: body.itemsOverride?.length,
      shippingState: !!shipping
    })

    // basic validation
    if (!shipping?.email || !shipping.firstName || !shipping.address1 || !shipping.postalCode) {
      return badRequest("Missing required shipping fields");
    }

    const headerList = await headers();
    const cookieStore = await cookies();
    const cookieHeader = headerList.get("cookie") || undefined;

    const itemsOverride =
      Array.isArray(body.itemsOverride) && body.itemsOverride.length
        ? body.itemsOverride
          .filter((it) => it?.variant_id && Number(it.quantity) > 0)
          .map((it) => ({
            variant_id: it.variant_id,
            quantity: Math.max(1, Number(it.quantity)),
            unit_price: typeof (it as any).price_minor === 'number' ? (it as any).price_minor : undefined
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
          // addItemToCart only supports standard variant add. Prices are overriden later in createDraftOrder
          await addItemToCart(temp.id, { variant_id: item.variant_id, quantity: item.quantity });
        }
        const refreshed = await backend(`/store/carts/${encodeURIComponent(temp.id)}`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          cart = await enrichCartWithFlashSale(
            (data.cart as Record<string, unknown>) || (data as Record<string, unknown>)
          );
        } else {
          cart = temp.cart ? await enrichCartWithFlashSale(temp.cart as Record<string, unknown>) : null;
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
      cart = await enrichCartWithFlashSale(cartData.cart as Record<string, unknown>);
    }

    if (!cart) {
      return badRequest("Cart is empty or unavailable");
    }

    // Debug: Log cart structure
    console.log("🛒 [Draft Order] Cart Debug:", {
      hasCart: !!cart,
      hasItems: !!cart.items,
      itemsIsArray: Array.isArray(cart.items),
      itemsLength: Array.isArray(cart.items) ? cart.items.length : 0,
      firstItem: Array.isArray(cart.items) && cart.items.length > 0 ? cart.items[0] : null,
    });

    const items = Array.isArray(cart.items)
      ? cart.items
        .map((item: unknown) => {
          const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          const variantObj = record.variant as Record<string, unknown> | undefined;
          const variantId =
            (typeof record.variant_id === "string" && record.variant_id) ||
            (variantObj && typeof variantObj.id === "string" && variantObj.id) ||
            (typeof record.id === "string" && record.id) ||
            undefined;
          if (typeof variantId !== "string") return null;
          const quantityRaw =
            typeof record.quantity === "number"
              ? record.quantity
              : Number.isFinite(Number(record.quantity))
                ? Number(record.quantity)
                : 1;
          const quantity = Math.max(1, quantityRaw);

          // Apply price override if it matches an overridden item (for Buy Now)
          const override = itemsOverride?.find(it => it.variant_id === variantId)
          const unit_price = override?.unit_price

          return {
            variant_id: variantId,
            quantity,
            unit_price
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)) as unknown as { variant_id: string; quantity: number; unit_price?: number }[]
      : [];

    if (!items.length) {
      return badRequest("Cart has no items");
    }

    const billing = body.billingSameAsShipping || !body.billing ? shipping : body.billing;

    const paymentMethod = body.paymentMethod || "razorpay";
    const authCustomerPromise = body.oweg10Applied
      ? getAuthenticatedCustomer(cookieHeader)
      : Promise.resolve(null);

    // Ensure we have a valid region (env var is instant; only fetch when missing)
    const regionId =
      (typeof cart.region_id === "string" ? cart.region_id : undefined) ||
      REGION_ID ||
      (await getFallbackRegionId());
    const cartCurrency = (typeof cart.currency_code === "string" ? cart.currency_code : undefined) || "inr";

    const cartItemRecords = Array.isArray(cart.items)
      ? (cart.items as Array<Record<string, unknown>>)
      : [];
    const itemsTotal = cartItemRecords.reduce(
      (sum, record) => sum + cartItemLineTotalRupees(record, cartCurrency),
      0
    );
    const shippingCharge = calculateStatewiseShipping(itemsTotal, shipping.state);
    const oweg10DiscountRupees = body.oweg10Applied ? calculateOweg10Discount(itemsTotal) : 0;

    let coinDiscountRupees = 0;
    if (typeof body.coinDiscount === "number" && body.coinDiscount > 0) {
      coinDiscountRupees = body.coinDiscount;
    }

    const cartShippingMethods = Array.isArray((cart as Record<string, unknown>).shipping_methods)
      ? ((cart as Record<string, unknown>).shipping_methods as Array<Record<string, unknown>>)
      : [];
    const shippingOptionFromCart = cartShippingMethods.find(
      (method) => typeof method.shipping_option_id === "string"
    )?.shipping_option_id as string | undefined;
    const resolvedShippingOptionId = await resolveShippingOptionId(cartId, shippingOptionFromCart);

    if (!resolvedShippingOptionId) {
      return badRequest(
        "Shipping option unavailable. Configure MEDUSA_DEFAULT_SHIPPING_OPTION_ID or add a shipping method to the cart."
      );
    }

    const shippingMethodPayload: Record<string, unknown> = {
      amount: shippingCharge,
      price: shippingCharge,
      name: shippingCharge === 0 ? "Free Shipping" : "Standard Shipping",
      shipping_option_id: resolvedShippingOptionId,
      option_id: resolvedShippingOptionId,
      data: {
        pricing_rule: "statewise_subtotal",
        shipping_state: shipping.state || null,
        subtotal: itemsTotal,
      },
    };

    const shippingMethodsPayload = [shippingMethodPayload];
    const cartCustomerId =
      typeof (cart as Record<string, unknown>)?.customer_id === "string"
        ? ((cart as Record<string, unknown>).customer_id as string)
        : undefined;
    const authCustomer = await authCustomerPromise;
    const resolvedCustomerId =
      (typeof authCustomer?.id === "string" ? authCustomer.id : undefined) || cartCustomerId;

    if (body.oweg10Applied) {
      if (!resolvedCustomerId) {
        return NextResponse.json({ error: "Please sign in to use OWEG10." }, { status: 401 });
      }

      const reservation = await reserveOweg10(resolvedCustomerId);
      if (!reservation.ok) {
        const message =
          reservation.reason === "consumed"
            ? "OWEG10 has already been used on this account."
            : "OWEG10 is already being processed for your account. Please complete the current checkout or try again shortly.";
        return NextResponse.json({ error: message }, { status: 409 });
      }

      oweg10CustomerId = resolvedCustomerId;
      oweg10ReservationToken = reservation.reservationToken;
    }

    const payload = {
      region_id: regionId,
      email: shipping.email,
      currency_code: cartCurrency,
      billing_address: mapAddress(billing),
      shipping_address: mapAddress(shipping),
      items,
      metadata: {
        cart_id: cartId,
        referral_code: body.referralCode || null,
        shipping_method: resolvedShippingOptionId || "statewise-rule",
        payment_method: paymentMethod,
        mode: body.mode || (itemsOverride ? "buy_now" : "cart"),
        expected_shipping_price: shippingCharge,
        shipping_state: shipping.state || null,
        coin_discount_code: body.coinDiscountCode || null,
        coin_discount_minor: coinDiscountRupees > 0 ? Math.round(coinDiscountRupees * 100) : undefined,
        coin_discount_rupees: coinDiscountRupees > 0 ? coinDiscountRupees : undefined,
        coin_discount_applied: coinDiscountRupees > 0 ? `₹${coinDiscountRupees.toFixed(2)} OWEG Coins` : undefined,
        coins_discounted: coinDiscountRupees > 0 ? coinDiscountRupees : undefined,
        oweg10_code: body.oweg10Applied ? OWEG10_CODE : null,
        oweg10_discount_minor: oweg10DiscountRupees > 0 ? Math.round(oweg10DiscountRupees * 100) : undefined,
        oweg10_discount_rupees: oweg10DiscountRupees > 0 ? oweg10DiscountRupees : undefined,
        oweg10_applied: body.oweg10Applied ? `${OWEG10_CODE} · 10% off` : undefined,
        oweg10_customer_id: oweg10CustomerId || undefined,
        oweg10_reservation_token: oweg10ReservationToken || undefined,
        oweg10_pending: body.oweg10Applied ? true : undefined,
      },
      shipping_methods: shippingMethodsPayload
    };

    console.log("🛒 [Draft Order] Creating with payload:", { regionId, itemsCount: items.length, shippingMethods: shippingMethodsPayload });

    const draftRes = await createDraftOrder(payload);
    if (!draftRes.ok || !draftRes.data) {
      const error = extractMessage(draftRes.data) || "Failed to create draft order";
      console.error("🛒 [Draft Order Debug] Creation Failed:", error);
      if (oweg10ReservationToken && oweg10CustomerId) {
        await releaseOweg10Reservation(oweg10CustomerId, oweg10ReservationToken).catch(() => undefined);
      }
      if ((draftRes.status as number) === 401) {
        return NextResponse.json({ error: "Unauthorized: check MEDUSA_ADMIN_API_KEY on frontend server" }, { status: 401 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }

    const draftOrder = extractOrder(draftRes.data);
    console.log("🛒 [Draft Order Debug] Created Order Total:", draftOrder?.total);

    if (!draftOrder?.id) {
      if (oweg10ReservationToken && oweg10CustomerId) {
        await releaseOweg10Reservation(oweg10CustomerId, oweg10ReservationToken).catch(() => undefined);
      }
      return NextResponse.json({ error: "Draft order missing id" }, { status: 500 });
    }

    let medusaOrderId = draftOrder.id;
    let medusaCurrency = draftOrder.currency_code || cartCurrency;
    let medusaTotal = draftOrder.total || 0;

    const expectedTotal = itemsTotal + shippingCharge;

    if (medusaTotal < expectedTotal && shippingCharge > 0) {
      console.warn(`🛒 [Price Warning] Medusa total (${medusaTotal}) mismatch. Using Optimistic Total (${expectedTotal})`);
      medusaTotal = expectedTotal;
    }

    const finalTotal = Math.max(0, itemsTotal + shippingCharge - coinDiscountRupees - oweg10DiscountRupees);

    try {
      await syncOrderTaxInclusivePricing(medusaOrderId, {
        expectedGrandTotal: finalTotal,
        shippingRupees: shippingCharge,
        coinDiscountRupees,
        oweg10DiscountRupees,
      });
    } catch (taxErr) {
      console.warn("Failed to sync tax-inclusive pricing on draft order:", taxErr);
    }

    // COD fast path: return after draft creation (~1 API call). Convert + confirm runs on success page.
    if (paymentMethod === "cod") {
      return NextResponse.json({
        medusaOrderId,
        total: finalTotal,
        currency_code: medusaCurrency,
        cartId,
        draft: true,
        codFast: true,
        coinDiscountApplied: coinDiscountRupees,
        oweg10DiscountApplied: oweg10DiscountRupees,
      });
    }

    let converted = false;
    let conversionError: string | null = null;

    // Razorpay stays as draft until payment succeeds. COD converts on confirm.
    if (paymentMethod === "razorpay") {
      converted = false;
    }

    // Ledger fallback when frontend did not send coin amount
    if (coinDiscountRupees <= 0 && body.coinDiscountCode && cartCustomerId) {
      try {
        const spend = await findSpendByReference({
          customerId: cartCustomerId,
          referenceId: body.coinDiscountCode,
        });
        if (spend) {
          coinDiscountRupees = spend.amountMinor / 100;
        }
      } catch (err) {
        console.error("Coin discount lookup failed:", err);
      }
    }

    const payableRupees = Math.max(
      0,
      itemsTotal + shippingCharge - coinDiscountRupees - oweg10DiscountRupees
    );
    const finalTotalAfterLookup =
      itemsTotal > 0 ? payableRupees : Math.max(0, medusaTotal - coinDiscountRupees - oweg10DiscountRupees);

    console.log("💰 Order payable:", {
      itemsTotal,
      shippingCharge,
      coinDiscountRupees,
      oweg10DiscountRupees,
      medusaTotal,
      payableRupees: finalTotalAfterLookup,
    });

    if (medusaOrderId && converted) {
      try {
        await runPostConvertCheckoutSideEffects(medusaOrderId, {
          expected_shipping_price: shippingCharge,
          coin_discount_rupees: coinDiscountRupees,
          coins_discounted: coinDiscountRupees,
        });
      } catch (err) {
        console.warn("Failed to sync post-convert checkout side effects:", err);
      }
    }

    if (coinDiscountRupees > 0 && medusaOrderId) {
      try {
        await updateCheckoutOrderMetadata(medusaOrderId, !converted, {
          coin_discount_code: body.coinDiscountCode || null,
          coin_discount_minor: Math.round(coinDiscountRupees * 100),
          coin_discount_rupees: coinDiscountRupees,
          coin_discount_applied: `₹${coinDiscountRupees.toFixed(2)} OWEG Coins`,
          coins_discounted: coinDiscountRupees,
        });
      } catch (err) {
        console.warn("Failed to persist coin discount metadata:", err);
      }
    }

    if (body.oweg10Applied && oweg10ReservationToken && oweg10CustomerId && medusaOrderId && converted) {
      const consumeResult = await consumeOweg10Reservation({
        customerId: oweg10CustomerId,
        reservationToken: oweg10ReservationToken,
        orderId: medusaOrderId,
        metadata: {
          payment_method: paymentMethod,
          source: "draft-order-convert",
        },
      });

      if (!consumeResult.ok) {
        throw new Error(
          consumeResult.reason === "consumed"
            ? "OWEG10 has already been used on this account."
            : "OWEG10 reservation expired. Please try again."
        );
      }

      oweg10Consumed = true;

      try {
        await updateCheckoutOrderMetadata(medusaOrderId, !converted, {
          oweg10_code: OWEG10_CODE,
          oweg10_discount_minor: Math.round(oweg10DiscountRupees * 100),
          oweg10_discount_rupees: oweg10DiscountRupees,
          oweg10_applied: `${OWEG10_CODE} · 10% off`,
          oweg10_pending: false,
          oweg10_consumed: true,
          oweg10_consumed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Failed to persist OWEG10 metadata", error);
      }

      await syncOweg10ConsumedCustomerMetadata(oweg10CustomerId).catch((err) => {
        console.warn("Failed to sync OWEG10 customer metadata", err);
      });
    }

    let razorpay:
      | {
          orderId: string;
          key: string;
          amount: number;
          currency: string;
        }
      | undefined;

    if (paymentMethod === "razorpay" && medusaOrderId && finalTotalAfterLookup > 0) {
      try {
        const currency = (medusaCurrency || "inr").toString().toUpperCase();
        const rzpOrder = await createRazorpayOrder(
          {
            amount: finalTotalAfterLookup,
            currency,
            receipt: medusaOrderId,
            notes: { medusa_order_id: medusaOrderId },
          },
          { amountIsPaise: false }
        );

        await updateCheckoutOrderMetadata(medusaOrderId, !converted, {
          razorpay_order_id: rzpOrder.id,
          razorpay_payment_status: "created",
        });

        razorpay = {
          orderId: rzpOrder.id,
          key: getPublicRazorpayKey(),
          amount: finalTotalAfterLookup,
          currency,
        };
      } catch (rzpErr) {
        console.error("Failed to pre-create Razorpay order during draft-order", rzpErr);
      }
    }

    return NextResponse.json({
      medusaOrderId,
      total: finalTotalAfterLookup,
      currency_code: medusaCurrency,
      cartId,
      draft: !converted,
      conversionWarning: conversionError || undefined,
      coinDiscountApplied: coinDiscountRupees,
      oweg10DiscountApplied: oweg10DiscountRupees,
      razorpay,
    });
  } catch (err) {
    console.error("draft-order error", err);
    if (oweg10ReservationToken && oweg10CustomerId && !oweg10Consumed) {
      await releaseOweg10Reservation(oweg10CustomerId, oweg10ReservationToken).catch((releaseErr) => {
        console.warn("Failed to release OWEG10 reservation", releaseErr);
      });
    }
    const message = err instanceof Error && err.message ? err.message : "Unable to create draft order";
    const status = /OWEG10/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
