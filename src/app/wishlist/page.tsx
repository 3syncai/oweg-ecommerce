import type { Metadata } from "next";
import WishlistContent from "@/components/account/WishlistContent";

export default function WishlistPage() {
  return <WishlistContent />;
}

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Find products you have saved for later in your OWEG wishlist.",
  robots: { index: false, follow: false },
};
