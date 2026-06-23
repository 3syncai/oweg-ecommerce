"use client";

import { toast } from "sonner";
import OrdersUiIcon from "@/components/ui/icons/orders-ui/OrdersUiIcon";

type OrderCopyButtonProps = {
  value: string;
  label?: string;
};

export default function OrderCopyButton({ value, label = "Copy" }: OrderCopyButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2A33] transition hover:border-[#66C940]/40 hover:text-[#66C940]"
    >
      <OrdersUiIcon name="copy-order-id" size={14} className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
