import type { Metadata } from "next";
import NotificationInbox from '@/components/account/NotificationInbox'

export default function NotificationsRedirect() {
  return <NotificationInbox />
}

export const metadata: Metadata = {
  title: "Notifications",
  description: "Find offers and updates sent to your OWEG account.",
  robots: { index: false, follow: false },
};
