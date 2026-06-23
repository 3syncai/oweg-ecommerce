"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogoutConfirmModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function LogoutConfirmModal({ open, onClose }: LogoutConfirmModalProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !signingOut) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, signingOut]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      onClose();
      router.push("/");
    } catch (err) {
      console.error("logout failed", err);
    } finally {
      setSigningOut(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!signingOut) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="logout-modal-title" className="text-lg font-semibold text-[#1F2A33]">
          Sign out?
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          You will need to sign in again to access your account.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={signingOut}
            className="min-w-[96px] border-gray-200 text-[#1F2A33] hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={signingOut}
            className={cn(
              "min-w-[96px] bg-red-600 text-white hover:bg-red-700",
              signingOut && "opacity-70"
            )}
          >
            {signingOut ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
