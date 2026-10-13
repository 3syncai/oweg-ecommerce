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
      className="inline-flex min-h-9 shrink-0 self-start items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-green-200 hover:text-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
    >
      <OrdersUiIcon name="copy-order-id" size={14} className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
