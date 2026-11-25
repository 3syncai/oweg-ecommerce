import type { Metadata } from "next";
import OrdersContent from "@/components/account/OrdersContent";

export default function AccountOrdersPage() {
  return <OrdersContent embedded />;
}

export const metadata: Metadata = {
  title: "Your orders",
  description: "View your OWEG order history and find delivery, returns and order details.",
  robots: { index: false, follow: false },
};
