"use client";

import { useEffect, useRef } from "react";
import styles from "./CustomerLoginModal.module.css";
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="customer-login-title"
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
        <CustomerLoginFlow
          variant="modal"
          onClose={onClose}
          onSuccess={onSuccess}
          signupRedirectPath={signupRedirectPath}
        />
    </dialog>
  );
}
