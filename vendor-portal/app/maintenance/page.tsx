import type { Metadata } from "next";
import { getDebugControllerSettings } from "@/lib/debug-controller/settings";

export const metadata: Metadata = {
  title: "Maintenance | OWEG Vendor Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const settings = await getDebugControllerSettings();

  return (
    <div className="min-h-screen flex items-center justify-center bg-oweg-page px-4">
      <div className="max-w-lg text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-oweg-500/15 flex items-center justify-center">
          <span className="text-3xl" aria-hidden="true">
            🔧
          </span>
        </div>
        <h1 className="text-3xl font-bold text-ui-fg-base">
          {settings.maintenanceTitle}
        </h1>
        <p className="text-ui-fg-subtle leading-relaxed">
          {settings.maintenanceMessage}
        </p>
        <p className="text-sm text-ui-fg-muted">OWEG Vendor Portal</p>
      </div>
    </div>
  );
}
