import type { Metadata } from "next";
import WishlistContent from "@/components/account/WishlistContent";

export default function AccountWishlistPage() {
  return <WishlistContent embedded />;
}

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Find products you have saved for later in your OWEG wishlist.",
};
