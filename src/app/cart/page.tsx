import type { Metadata } from "next";
import Cart from "./Cart";

export default function CartPage() {
  return <Cart />;
}

export const metadata: Metadata = {
  title: "Shopping cart",
  description: "Review your selected items and quantities before checking out on OWEG.",
  robots: { index: false, follow: false },
};
