import type { Metadata } from "next";
import NotificationsContent from "@/components/account/NotificationsContent";

export default function AccountNotificationsPage() {
  return <NotificationsContent embedded />;
}

export const metadata: Metadata = {
  title: "Notification preferences",
  description: "Manage notifications for your OWEG account and device.",
};
