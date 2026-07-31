"use client";

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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/35 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
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
