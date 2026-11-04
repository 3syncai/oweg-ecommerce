import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies"

const CART_COOKIE = "cart_id"

/** Cart id is server-read only (guest_cart_id in localStorage covers client). */
export function cartCookieOptions(
  overrides: Partial<ResponseCookie> = {}
): Partial<ResponseCookie> {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.CART_COOKIE_SECURE === "1"

  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 30,
    ...overrides,
  }
}

export function clearCartCookieOptions(): Partial<ResponseCookie> {
  return cartCookieOptions({ maxAge: 0 })
}

export { CART_COOKIE }
