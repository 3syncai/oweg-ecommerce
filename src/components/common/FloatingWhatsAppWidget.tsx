"use client";

import { FaWhatsapp } from "react-icons/fa";
import { usePathname } from "next/navigation";
import { useDebugControllerSettings } from "@/components/debug-controller/DebugControllerProvider";

function normalizeWhatsAppNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

export default function FloatingWhatsAppWidget() {
  const settings = useDebugControllerSettings();
  const pathname = usePathname();
  const isAccountOverview = pathname === "/account";
  const isWishlistPage = pathname === "/wishlist" || pathname === "/account/wishlist";
  const bottomClass = isWishlistPage
    ? "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:bottom-24 md:bottom-6"
    : "bottom-[calc(env(safe-area-inset-bottom)+7.75rem)] sm:bottom-24 md:bottom-6";
  const positionClass = pathname === "/"
    ? "right-3 sm:right-4"
    : `left-3 sm:left-4 ${isAccountOverview ? "max-sm:left-auto max-sm:right-3" : ""}`;

  const rawNumber =
    settings.whatsappNumber ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "";
  const rawMessage =
    settings.whatsappMessage ||
    process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE ||
    "Hi, I need help with my order.";
  const number = normalizeWhatsAppNumber(rawNumber);

  if (!number) {
    return null;
  }

  const href = `https://wa.me/${number}?text=${encodeURIComponent(rawMessage)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className={`fixed ${bottomClass} z-[120] group rounded-full focus-visible:outline-2 focus-visible:outline-[#679e3e] focus-visible:outline-offset-4 ${positionClass}`}
    >
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f8ef] text-[#496837] shadow-[0_3px_12px_rgba(38,57,27,0.1)] border border-[#d9e5cf] transition-colors duration-200 ease-out group-hover:bg-[#eaf3e2] group-hover:border-[#bdcfad]">
        <FaWhatsapp className="h-6 w-6 shrink-0 text-[#557b35]" aria-hidden="true" />
      </span>
    </a>
  );
}
