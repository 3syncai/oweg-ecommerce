/**
 * Medusa admin-created promo codes applied at OWEG checkout.
 * Separate from OWEG10 (custom checkbox) and wallet coins.
 */

import { adminFetch } from "@/lib/medusa-admin";
import { OWEG10_CODE } from "@/lib/oweg10-shared";

export type MedusaPromoLookup = {
  id: string;
  code: string;
  status: string;
  type: string;
  application_method?: {
    type?: string | null;
    target_type?: string | null;
    value?: number | null;
    currency_code?: string | null;
    allocation?: string | null;
  } | null;
};

export type PromoValidationResult =
  | {
      ok: true;
      code: string;
      promotionId: string;
      discountRupees: number;
      label: string;
      methodType: string;
      targetType: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

export function isReservedPromoCode(code: string): boolean {
  const upper = code.trim().toUpperCase();
  if (!upper) return true;
  if (upper === OWEG10_CODE) return true;
  if (upper.startsWith("COINS-")) return true;
  return false;
}

export async function findActivePromotionByCode(
  code: string
): Promise<MedusaPromoLookup | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { ok, data } = await adminFetch<{ promotions?: MedusaPromoLookup[] }>(
    `/admin/promotions?q=${encodeURIComponent(trimmed)}&limit=20`
  );
  if (!ok || !data?.promotions?.length) return null;

  const upper = trimmed.toUpperCase();
  const match = data.promotions.find(
    (p) => (p.code || "").toUpperCase() === upper && p.status === "active"
  );
  return match || null;
}

/**
 * Compute order-level discount in rupees from a Medusa promotion.
 * Supports standard fixed/percentage on order or items.
 * Buy-get and shipping-only promos are rejected (explicitly unsupported).
 */
export function calculateMedusaPromoDiscount(
  promo: MedusaPromoLookup,
  itemsSubtotalRupees: number
): PromoValidationResult {
  const code = (promo.code || "").toUpperCase();
  if (isReservedPromoCode(code)) {
    return {
      ok: false,
      error:
        code === OWEG10_CODE
          ? `${OWEG10_CODE} is applied via the checkout checkbox, not as a promo code.`
          : "This code cannot be applied here.",
      code,
    };
  }

  if (promo.status !== "active") {
    return { ok: false, error: "This promotion is not active.", code };
  }

  if ((promo.type || "").toLowerCase() === "buyget") {
    return {
      ok: false,
      error: "Buy X Get Y promotions are not supported at checkout yet.",
      code,
    };
  }

  const method = promo.application_method || {};
  const methodType = String(method.type || "").toLowerCase();
  const targetType = String(method.target_type || "").toLowerCase();
  const value = toNumber(method.value);
  const items = Math.max(0, itemsSubtotalRupees);

  if (targetType === "shipping_methods") {
    return {
      ok: false,
      error: "Free-shipping promotions are not supported at checkout yet.",
      code,
    };
  }

  if (!["order", "items"].includes(targetType)) {
    return {
      ok: false,
      error: "This promotion target is not supported at checkout yet.",
      code,
    };
  }

  let discount = 0;
  let label = code;

  if (methodType === "fixed") {
    // Medusa admin stores fixed values in major currency units for this store (INR).
    discount = round2(Math.min(value, items));
    label = `${code} · Rs.${discount.toFixed(2)} off`;
  } else if (methodType === "percentage") {
    const pct = Math.min(100, Math.max(0, value));
    discount = round2((items * pct) / 100);
    label = `${code} · ${pct}% off`;
  } else {
    return {
      ok: false,
      error: "Unsupported promotion method type.",
      code,
    };
  }

  if (discount <= 0) {
    return { ok: false, error: "Promotion does not produce a discount.", code };
  }

  return {
    ok: true,
    code,
    promotionId: promo.id,
    discountRupees: discount,
    label,
    methodType,
    targetType,
  };
}

export async function validateMedusaPromoCode(
  code: string,
  itemsSubtotalRupees: number
): Promise<PromoValidationResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a promo code." };
  }

  if (isReservedPromoCode(trimmed)) {
    return calculateMedusaPromoDiscount(
      {
        id: "reserved",
        code: trimmed.toUpperCase(),
        status: "active",
        type: "standard",
      },
      itemsSubtotalRupees
    );
  }

  const promo = await findActivePromotionByCode(trimmed);
  if (!promo) {
    return { ok: false, error: "Invalid or inactive promo code.", code: trimmed.toUpperCase() };
  }

  return calculateMedusaPromoDiscount(promo, itemsSubtotalRupees);
}
