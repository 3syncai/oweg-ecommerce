"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function OfflineNotice() {
  const online = useOnlineStatus();
  return (
    <div role="status" aria-atomic="true">
      {!online && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-950">
          <WifiOff size={17} className="shrink-0" aria-hidden="true" />
          <span>You’re offline. Reconnect to update your cart or place an order.</span>
        </div>
      )}
    </div>
  );
}
