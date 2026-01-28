import { NextRequest, NextResponse } from "next/server";
import {
  appendUpstreamCookies,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth";

export const dynamic = "force-dynamic";

type ChangePasswordPayload = {
  currentPassword?: string;
  newPassword?: string;
};

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload;
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error) return payload.error;
    if (typeof payload.message === "string" && payload.message) return payload.message;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined;
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    };
    if (!forwardedCookie) {
      return NextResponse.json({ error: "Please sign in to update your password." }, { status: 401 });
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as ChangePasswordPayload;
    const currentPassword = body.currentPassword?.trim() || "";
    const newPassword = body.newPassword?.trim() || "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters long." }, { status: 400 });
    }

    const updateRes = await medusaStoreFetch("/store/customers/me", {
      method: "POST",
      forwardedCookie,
      forwardedHeaders,
      body: JSON.stringify({
        password: newPassword,
        old_password: currentPassword,
      }),
    });

    if (!updateRes.ok) {
      const payload = await extractErrorPayload(updateRes);
      const message = toErrorMessage(payload, "Unable to update password.");
      return NextResponse.json({ error: message }, { status: updateRes.status });
    }

    const response = NextResponse.json({ success: true }, { status: 200 });
    appendUpstreamCookies(response, updateRes);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
