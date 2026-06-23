"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import SignOutModalIcon from "@/components/ui/icons/signout-modal/SignOutModalIcon";
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
        className="w-full max-w-[420px] rounded-2xl bg-white px-6 py-7 text-center shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center">
          <SignOutModalIcon
            name="logout-modal-illustration"
            size={72}
            className="h-[72px] w-[72px]"
          />
        </div>

        <h2 id="logout-modal-title" className="text-xl font-bold text-[#1F2A33]">
          Sign out of your account?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#667085]">
          You&apos;ll need to sign in again to access your orders, wishlist, and account
          settings.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#EAF8E7] px-4 py-3 text-left">
          <SignOutModalIcon
            name="secure-shield-check"
            size={28}
            className="h-7 w-7 shrink-0"
          />
          <p className="text-sm font-medium text-[#0B7A22]">
            Your account and data will remain secure.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={signingOut}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E6E9EC] bg-white px-3 text-sm font-semibold text-[#66C940] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SignOutModalIcon name="stay-signed-in" size={18} className="h-[18px] w-[18px]" />
            Stay Signed In
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={signingOut}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D92D20] px-3 text-sm font-semibold text-white transition hover:bg-[#B42318] disabled:cursor-not-allowed",
              signingOut && "opacity-70"
            )}
          >
            <SignOutModalIcon name="sign-out-red" size={18} className="h-[18px] w-[18px]" />
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
