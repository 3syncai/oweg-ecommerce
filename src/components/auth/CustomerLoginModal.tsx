"use client";

import { useEffect, useRef } from "react";
import CustomerLoginFlow from "@/components/auth/CustomerLoginFlow";
import type { StoreCustomer } from "@/contexts/AuthProvider";

type CustomerLoginModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: NonNullable<StoreCustomer>) => void;
  signupRedirectPath?: string;
};

export default function CustomerLoginModal({
  open,
  onClose,
  onSuccess,
  signupRedirectPath,
}: CustomerLoginModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/35 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-login-title"
        tabIndex={-1}
        className="w-full max-w-md my-auto outline-none"
      >
        <CustomerLoginFlow
          variant="modal"
          onClose={onClose}
          onSuccess={onSuccess}
          signupRedirectPath={signupRedirectPath}
        />
      </div>
    </div>
  );
}
