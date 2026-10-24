import crypto from "crypto";
import { NextRequest } from "next/server";

const CONTROLLER_PATH = "/debug-controller-4719";

/** Known weak defaults that must never be used in production. */
export const INSECURE_DEBUG_CONTROLLER_SECRETS = new Set([
  "",
  "oweg-debug-4719-change-me",
  "Test@123",
]);

const DEV_FALLBACK_SECRET = "oweg-debug-4719-change-me";

function readDebugSecretFromEnv(): string {
  return (
    process.env.DEBUG_CONTROLLER_SECRET?.trim() ||
    process.env.DEBUG_CONTROLLER_TOKEN?.trim() ||
    ""
  );
}

/**
 * Fail fast during production startup when the debug controller secret is missing
 * or still set to a known insecure default.
 */
export function assertDebugControllerSecretForProduction(): void {
  if (process.env.NODE_ENV !== "production") return;

  const secret = readDebugSecretFromEnv();
  if (!secret || INSECURE_DEBUG_CONTROLLER_SECRETS.has(secret)) {
    throw new Error(
      "DEBUG_CONTROLLER_SECRET must be set to a strong unique value in production (not the default placeholder)."
    );
  }
}

export function getDebugControllerSecret(): string {
  const fromEnv = readDebugSecretFromEnv();
  if (fromEnv) {
    if (
      process.env.NODE_ENV === "production" &&
      INSECURE_DEBUG_CONTROLLER_SECRETS.has(fromEnv)
    ) {
      throw new Error(
        "DEBUG_CONTROLLER_SECRET is set to an insecure default in production."
      );
    }
    return fromEnv;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DEBUG_CONTROLLER_SECRET is required in production.");
  }

  return DEV_FALLBACK_SECRET;
}

export function hashDebugToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyDebugControllerToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const secret = getDebugControllerSecret();
  const a = Buffer.from(hashDebugToken(token));
  const b = Buffer.from(hashDebugToken(secret));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function extractDebugAuthToken(req: NextRequest): string | null {
  const header =
    req.headers.get("x-debug-controller-token") ||
    req.headers.get("authorization");

  if (!header) return null;
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return header.trim();
}

export function isDebugControllerPath(pathname: string): boolean {
  return pathname === CONTROLLER_PATH || pathname.startsWith(`${CONTROLLER_PATH}/`);
}

export { CONTROLLER_PATH };
