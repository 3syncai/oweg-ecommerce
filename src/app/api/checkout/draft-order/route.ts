// File path: src/app/api/checkout/draft-order/route.ts
// FORCE REBUILD 1


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
  shippingPrice?: number;
  shippingMethodName?: string;
  coinDiscount?: number; // Coin discount in rupees
  customerId?: string; // Customer ID for coin discount lookup
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

export async function POST(req: Request) {
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

    // Ensure we have a valid region
    const fallbackRegion = await getFallbackRegionId();
    const regionId = (typeof cart.region_id === "string" ? cart.region_id : undefined) || fallbackRegion;
    const cartCurrency = (typeof cart.currency_code === "string" ? cart.currency_code : undefined) || "inr";

    // Prepare shipping methods
    // NOTE: Price passed from frontend is MAJOR (e.g. 150). Convert to MINOR (15000).
    const shippingPriceMinor = typeof (body as any).shippingPrice === 'number' ? (body as any).shippingPrice! * 100 : 0;

    // Clean, standard payload for Medusa
    // Declare coinDiscountRupees early (will be populated from database later)
    let coinDiscountRupees = 0;

    // Clean, standard payload for Medusa
    const shippingMethodsPayload = Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0
      ? cart.shipping_methods.map((sm: any) => ({
        shipping_option_id: sm.shipping_option_id,
        option_id: sm.shipping_option_id, // Compat
        amount: sm.price || 0,
        price: sm.price || 0, // Compat
        name: sm.name || "Shipping",
        data: sm.data || {},
      }))
      : (body.shippingMethod
        ? [{
          shipping_option_id: body.shippingMethod,
          option_id: body.shippingMethod, // Compat
          amount: shippingPriceMinor || 0,
          price: shippingPriceMinor || 0, // Compat
          name: (body as any).shippingMethodName || "Shipping",
          data: {},
        }]
        : undefined);

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
        shipping_method: body.shippingMethod || null,
        payment_method: paymentMethod,
        mode: body.mode || (itemsOverride ? "buy_now" : "cart"),
        expected_shipping_price: shippingPriceMinor,
        coin_discount_rupees: coinDiscountRupees > 0 ? coinDiscountRupees : undefined, // Visible in admin
        coin_discount_applied: coinDiscountRupees > 0 ? `₹${coinDiscountRupees.toFixed(2)} OWEG Coins` : undefined
      },
      shipping_methods: shippingMethodsPayload
    };

    console.log("🛒 [Draft Order] Creating with payload:", { regionId, itemsCount: items.length, shippingMethods: shippingMethodsPayload });

    const draftRes = await createDraftOrder(payload);
    if (!draftRes.ok || !draftRes.data) {
      const error = extractMessage(draftRes.data) || "Failed to create draft order";
      console.error("🛒 [Draft Order Debug] Creation Failed:", error);
      if ((draftRes.status as number) === 401) {
        return NextResponse.json({ error: "Unauthorized: check MEDUSA_ADMIN_API_KEY on frontend server" }, { status: 401 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }

    const draftOrder = extractOrder(draftRes.data);
    console.log("🛒 [Draft Order Debug] Created Order Total:", draftOrder?.total);

    if (!draftOrder?.id) {
      return NextResponse.json({ error: "Draft order missing id" }, { status: 500 });
    }

    let medusaOrderId = draftOrder.id;
    let medusaCurrency = draftOrder.currency_code || cartCurrency;
    let medusaTotal = draftOrder.total || 0;

    // Optimistic Total Calculation
    const itemsTotal = items.reduce((sum, item) => sum + (item.unit_price || 0) * item.quantity, 0);
    const expectedTotal = itemsTotal + shippingPriceMinor;

    if (medusaTotal < expectedTotal && shippingPriceMinor > 0) {
      console.warn(`🛒 [Price Warning] Medusa total (${medusaTotal}) mismatch. Using Optimistic Total (${expectedTotal})`);
      medusaTotal = expectedTotal;
    }

    let converted = false;
    let conversionError: string | null = null;

    if (paymentMethod === "razorpay") {
      try {
        const convertedRes = await convertDraftOrder(draftOrder.id);
        if (convertedRes.ok) {
          const convertedOrder = convertedRes.data ? extractOrder(convertedRes.data) : null;
          if (convertedOrder?.id) {
            medusaOrderId = convertedOrder.id;
            // If converted order has correct total, use it. Otherwise keep optimistic.
            if (convertedOrder.total && convertedOrder.total >= expectedTotal) medusaTotal = convertedOrder.total;
            converted = true;
          } else {
            conversionError = "convertDraftOrder returned no order id";
          }
        } else {
          conversionError = extractMessage(convertedRes.data) || `convertDraftOrder failed (${convertedRes.status})`;
        }
      } catch (err) {
        conversionError = `convertDraftOrder threw for ${draftOrder.id} (${paymentMethod})`;
        console.error(conversionError, err);
      }
    }

    // DATABASE-DRIVEN COIN DISCOUNT - SIMPLIFIED & DEBUGGED
    console.log("🔍 [Coin Debug] Starting database query...");

    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });

      console.log("🔍 [Coin Debug] Database connection established");

      // SECURITY FIX: Get customer_id from auth context or request
      const customerId = headerList.get("x-customer-id") || body.customerId;

      if (!customerId) {
        console.log("⚠️ [Coin Debug] No customer ID available for coin lookup");
      } else {
        // Query coin redemptions for THIS SPECIFIC customer only
        const result = await pool.query(
          `SELECT amount, customer_id, created_at FROM wallet_transactions 
           WHERE transaction_type = 'REDEEMED' 
           AND status = 'USED'
           AND customer_id = $1
           AND created_at > NOW() - INTERVAL '2 minutes'
           ORDER BY created_at DESC 
           LIMIT 1`,
          [customerId]
        );

        console.log("🔍 [Coin Debug] Query executed, rows:", result.rows.length);

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const coinsDeducted = parseFloat(row.amount);
          coinDiscountRupees = coinsDeducted / 100; // Convert coins (paise) to rupees

          console.log("💰 [Database] FOUND coin redemption:", {
            coinsDeducted,
            coinDiscountRupees,
            customer: row.customer_id,
            timestamp: row.created_at
          });
        } else {
          console.log("⚠️ [Database] NO recent coin redemptions found in last 2 minutes");
        }
      }
      await pool.end();
    } catch (dbError) {
      console.error("❌ [Database] Query FAILED:", dbError);
    }

    console.log("🔍 [Coin Debug] Final discount value:", coinDiscountRupees);

    // Subtract discount from total
    const finalTotal = Math.max(0, medusaTotal - coinDiscountRupees);

    console.log("💰 Coin Discount Applied:", {
      coinDiscountRupees,
      originalTotal: medusaTotal,
      finalTotal,
      reduction: medusaTotal - finalTotal,
      source: coinDiscountRupees > 0 ? "database-wallet-transactions" : "none"
    });

    // ADD COIN DISCOUNT AS ORDER ADJUSTMENT in Medusa Admin
    if (coinDiscountRupees > 0 && medusaOrderId) {
      try {
        console.log("🔧 [Medusa] Adding coin discount adjustment to order...");

        const adminApiKey = process.env.MEDUSA_ADMIN_API_KEY;
        if (adminApiKey) {
          const adjustmentRes = await fetch(`${BACKEND_BASE}/admin/orders/${medusaOrderId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${adminApiKey}`
            },
            body: JSON.stringify({
              items: [
                {
                  // Add negative line item for discount
                  title: "Coin Discount",
                  quantity: 1,
                  unit_price: -Math.round(coinDiscountRupees * 100), // Negative amount in paise
                  variant_id: null,
                  metadata: {
                    type: "coin_discount",
                    coins_redeemed: Math.round(coinDiscountRupees * 100)
                  }
                }
              ]
            })
          });

          if (adjustmentRes.ok) {
            console.log("✅ [Medusa] Coin discount adjustment added to order");
          } else {
            const errorText = await adjustmentRes.text();
            console.warn("⚠️ [Medusa] Failed to add adjustment:", errorText);
          }
        } else {
          console.warn("⚠️ [Medusa] MEDUSA_ADMIN_API_KEY not configured");
        }
      } catch (updateError) {
        console.error("❌ [Medusa] Error adding adjustment:", updateError);
      }
    }

    return NextResponse.json({
      medusaOrderId,
      total: finalTotal, // Return discounted total
      currency_code: medusaCurrency,
      cartId,
      draft: !converted,
      conversionWarning: conversionError || undefined,
      coinDiscountApplied: coinDiscountRupees, // For frontend reference
    });
  } catch (err) {
    console.error("draft-order error", err);
    return NextResponse.json({ error: "Unable to create draft order" }, { status: 500 });
  }
}
