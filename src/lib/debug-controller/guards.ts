import { NextResponse } from "next/server";
import { getDebugControllerSettings } from "./settings";

export async function getCheckoutGuardResponse(): Promise<NextResponse | null> {
  const settings = await getDebugControllerSettings().catch(() => null);
  if (!settings) {
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable. Your cart is saved. Please try again shortly.", code: "CHECKOUT_SETTINGS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" } }
    );
  }

  if (settings.siteStatus === "maintenance") {
    return NextResponse.json(
      { error: "Site is under maintenance. Checkout is unavailable." },
      { status: 503 }
    );
  }

  if (!settings.enableCheckout || settings.siteStatus === "read_only") {
    return NextResponse.json(
      { error: "Checkout is temporarily disabled." },
      { status: 403 }
    );
  }

  return null;
}

export async function isRegistrationAllowed(): Promise<boolean> {
  const settings = await getDebugControllerSettings();
  if (settings.siteStatus === "maintenance") return false;
  return settings.enableRegistration;
}

export async function shouldShowMaintenancePage(): Promise<boolean> {
  const settings = await getDebugControllerSettings();
  return settings.siteStatus === "maintenance";
}
