export type CartApiPayload = Record<string, unknown>;

export const ZERO_DECIMAL_CURRENCIES = new Set<string>([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

type UnknownRecord = Record<string, unknown> | undefined | null;

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const extractCartObject = (payload?: UnknownRecord): CartApiPayload | undefined => {
  if (!isRecord(payload)) return undefined;
  const maybeCart = payload.cart;
  if (isRecord(maybeCart)) return maybeCart as CartApiPayload;
  return payload as CartApiPayload;
};

export const extractCartItems = (payload?: UnknownRecord): CartApiPayload[] => {
  const cart = extractCartObject(payload);
  if (!cart) return [];
  const rawItems = (cart.items as unknown) ?? (cart.line_items as unknown) ?? [];
  return Array.isArray(rawItems) ? (rawItems as CartApiPayload[]) : [];
};

export const extractCartCount = (payload?: UnknownRecord): number => {
  const items = extractCartItems(payload);
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + Math.max(0, toNumber(item.quantity, 0)), 0);
};

export function cartLineAmountRupees(
  record: Record<string, unknown>,
  currencyCode?: string
): number {
  const qty = Math.max(1, Number(record.quantity) || 1);
  const currency = currencyCode?.toUpperCase();

  if (typeof record.total === "number" && record.total > 0) {
    return amountToRupees(record.total, currency);
  }
  if (typeof record.subtotal === "number" && record.subtotal > 0) {
    return amountToRupees(record.subtotal, currency);
  }
  if (typeof record.unit_price === "number" && record.unit_price > 0) {
    return amountToRupees(record.unit_price, currency) * qty;
  }
  return 0;
}

/** Medusa v2 INR carts often use major units (₹1499); legacy/raw carts use paise (149900). */
function amountToRupees(amount: number, currencyCode?: string): number {
  const upper = currencyCode?.toUpperCase();
  if (upper && ZERO_DECIMAL_CURRENCIES.has(upper)) {
    return amount;
  }
  if (amount > 0 && amount < 10000) {
    return amount;
  }
  return toMajorUnits(amount, currencyCode);
}

export const toMajorUnits = (amount: number, currencyCode?: string): number => {
  const raw = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  if (!currencyCode) {
    return raw > 1000 ? raw / 100 : raw;
  }
  const upper = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) {
    return raw;
  }
  return raw / 100;
};
