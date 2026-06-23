"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { Button } from "@/components/ui/button";
import { useAccountSettings } from "@/hooks/useAccountSettings";
import { useAuth } from "@/contexts/AuthProvider";
import {
  type NotificationChannelSettings,
  type NotificationSettings,
} from "@/lib/account-settings";
import { cn } from "@/lib/utils";

type NotificationsContentProps = {
  embedded?: boolean;
};

type NotificationRow = {
  key: keyof NotificationSettings;
  label: string;
};

const NOTIFICATION_ROWS: NotificationRow[] = [
  { key: "orderConfirmation", label: "Order confirmation" },
  { key: "shippingUpdates", label: "Shipping updates" },
  { key: "deliveryUpdates", label: "Delivery updates" },
  { key: "flashSaleAlerts", label: "Flash sale alerts" },
  { key: "discountOffers", label: "Discount offers" },
  { key: "newArrivals", label: "New arrivals" },
  { key: "loginAlerts", label: "Login alerts" },
  { key: "passwordChanges", label: "Password changes" },
];

type ChannelKey = keyof NotificationChannelSettings;

const CHANNELS: Array<{
  key: ChannelKey;
  label: string;
  icon: "email" | "sms" | "whatsapp-message";
}> = [
  { key: "email", label: "Email", icon: "email" },
  { key: "sms", label: "SMS", icon: "sms" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp-message" },
];

function ChannelToggle({
  enabled,
  label,
  onToggle,
}: {
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${label} ${enabled ? "enabled" : "disabled"}`}
      className={cn(
        "mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition",
        enabled
          ? "border-[#66C940] bg-[#66C940] text-white"
          : "border-gray-200 bg-white text-gray-400 hover:border-[#66C940]/50"
      )}
    >
      {enabled ? "✓" : "—"}
    </button>
  );
}

export default function NotificationsContent({ embedded = false }: NotificationsContentProps) {
  const { customer } = useAuth();
  const {
    accountSettings,
    saveAccountSettings,
    saving,
    loading,
  } = useAccountSettings();

  const [notifications, setNotifications] = useState<NotificationSettings>(
    accountSettings.notifications
  );

  useEffect(() => {
    setNotifications(accountSettings.notifications);
  }, [accountSettings.notifications]);

  const toggleChannel = (
    rowKey: keyof NotificationSettings,
    channel: ChannelKey
  ) => {
    setNotifications((prev) => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [channel]: !prev[rowKey][channel],
      },
    }));
  };

  const handleSave = async () => {
    try {
      await saveAccountSettings({
        ...accountSettings,
        notifications,
        lastUpdated: new Date().toISOString(),
      });
      toast.success("Notification settings saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save notification settings.";
      toast.error(message);
    }
  };

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect="/account/notifications"
        title="Sign in to manage notifications"
        description="Please log in to choose how we contact you about orders and offers."
      />
    );
  }

  const wrapperClass = embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="notifications" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Notifications</h1>
            <p className="text-sm text-gray-600">Choose how you want to hear from us.</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notification settings…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,72px)] items-center gap-2 border-b border-gray-100 bg-[#FAFAFA] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">
              <span>Notification type</span>
              {CHANNELS.map((channel) => (
                <span key={channel.key} className="flex flex-col items-center gap-1 text-center">
                  <AccountHubIcon name={channel.icon} size={18} className="h-[18px] w-[18px]" />
                  {channel.label}
                </span>
              ))}
            </div>

            <div className="divide-y divide-gray-100">
              {NOTIFICATION_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,72px)] items-center gap-2 px-4 py-4 sm:px-6"
                >
                  <p className="text-sm font-medium text-[#1F2A33]">{row.label}</p>
                  {CHANNELS.map((channel) => (
                    <ChannelToggle
                      key={`${row.key}-${channel.key}`}
                      enabled={notifications[row.key][channel.key]}
                      label={`${row.label} ${channel.label}`}
                      onToggle={() => toggleChannel(row.key, channel.key)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Button
        type="button"
        className="rounded-full bg-[#66C940] text-white hover:bg-[#5ab838] sm:w-auto w-full"
        onClick={() => {
          void handleSave();
        }}
        disabled={saving || loading}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save Settings"
        )}
      </Button>
    </div>
  );
}
