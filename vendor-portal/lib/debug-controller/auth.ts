import crypto from "crypto";
import { NextRequest } from "next/server";

const CONTROLLER_PATH = "/debug-controller-4719";

export function getDebugControllerSecret(): string {
  return (
    process.env.DEBUG_CONTROLLER_SECRET ||
    process.env.DEBUG_CONTROLLER_TOKEN ||
    "oweg-debug-4719-change-me"
  );
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
