import { FaWhatsapp } from "react-icons/fa"

function normalizeWhatsAppNumber(value: string) {
  return value.replace(/[^\d]/g, "")
}

export default function FloatingWhatsAppWidget() {
  const rawNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""
  const rawMessage = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE || "Hi, I need help with my order."
  const number = normalizeWhatsAppNumber(rawNumber)

  if (!number) {
    return null
  }

  const href = `https://wa.me/${number}?text=${encodeURIComponent(rawMessage)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="fixed left-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 z-[80] group"
    >
      <span className="relative inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-3.5 py-3 shadow-[0_10px_24px_rgba(37,211,102,0.35)] border border-white/20 transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(37,211,102,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2">
        <FaWhatsapp className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline text-sm font-semibold whitespace-nowrap">Chat with us</span>
      </span>
    </a>
  )
}
