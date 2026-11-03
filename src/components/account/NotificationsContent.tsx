"use client";

import { useAuth } from "@/contexts/AuthProvider";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import BrowserPushPreferences from "./BrowserPushPreferences";

export default function NotificationsContent({ embedded = false }: { embedded?: boolean }) {
  const { customer, initializing } = useAuth();

  if (initializing) return <p role="status">Loading notification settings…</p>;
  if (!customer) {
    return <AccountLoginPrompt
      redirect="/account/notifications"
      title="Sign in to manage notifications"
      description="Sign in to manage notifications for your OWEG app."
    />;
  }

  return <div className={embedded ? "space-y-5" : "mx-auto max-w-5xl px-4 py-10"}>
    <BrowserPushPreferences key={customer.id} />
  </div>;
}
