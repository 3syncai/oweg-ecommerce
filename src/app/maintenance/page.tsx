import type { Metadata } from "next";
import { getDebugControllerSettings } from "@/lib/debug-controller/settings";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const settings = await getDebugControllerSettings();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-lg text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-[#7AC943]/15 flex items-center justify-center">
          <span className="text-3xl" aria-hidden="true">
            🔧
          </span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          {settings.maintenanceTitle}
        </h1>
        <p className="text-gray-600 leading-relaxed">
          {settings.maintenanceMessage}
        </p>
        <p className="text-sm text-gray-400">
          OWEG — Home Appliances & Electronics
        </p>
      </div>
    </div>
  );
}
