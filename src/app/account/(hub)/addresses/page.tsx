import type { Metadata } from "next";
import AddressesContent from "@/components/account/AddressesContent";

export default function AccountAddressesPage() {
  return <AddressesContent embedded />;
}

export const metadata: Metadata = {
  title: "Saved addresses",
  description: "Manage the delivery and billing addresses saved to your OWEG account.",
};
