const DEFAULT_SUCCESS_PATH = "/order/success";
const DEFAULT_FAILED_PATH = "/order/failed";

/**
 * Normalize configured return paths to a same-origin relative path.
 * Avoids router.push / redirects to a different Vercel preview URL that
 * triggers Deployment Protection login.
 */
export function resolveCheckoutReturnPath(
  configured: string | undefined,
  fallback: string
): string {
  const raw = (configured || fallback).trim();
  if (!raw) return fallback;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}${url.hash}`;
      return path && path !== "/" ? path : fallback;
    }
  } catch {
    // fall through
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function getCheckoutSuccessPath(): string {
  return resolveCheckoutReturnPath(
    process.env.NEXT_PUBLIC_PAYMENT_SUCCESS_URL,
    DEFAULT_SUCCESS_PATH
  );
}

export function getCheckoutFailedPath(): string {
  return resolveCheckoutReturnPath(
    process.env.NEXT_PUBLIC_PAYMENT_FAILED_URL,
    DEFAULT_FAILED_PATH
  );
}

export function buildCheckoutReturnUrl(
  path: string,
  params: Record<string, string>,
  origin: string
): string {
  const normalizedPath = resolveCheckoutReturnPath(path, path);
  const search = new URLSearchParams(params).toString();
  const relative = search ? `${normalizedPath}?${search}` : normalizedPath;
  return `${origin.replace(/\/$/, "")}${relative}`;
}

export function clearStaleBuyNowSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("buy_now_item");
  } catch {
    // ignore storage errors
  }
}
