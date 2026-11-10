"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type LogoutConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onSignedOut?: () => void;
};

export default function LogoutConfirmModal(props: LogoutConfirmModalProps) {
  return props.open ? <SignOutDialog {...props} /> : null;
}

function SignOutDialog({ onClose, onSignedOut }: LogoutConfirmModalProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const online = useOnlineStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = useId();
  const description = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);

  async function confirm() {
    if (pending.current || !online) return;
    pending.current = true;
    setSigningOut(true);
    setFailed(false);
    try {
      await logout();
      onClose();
      toast.success("Signed out");
      if (onSignedOut) onSignedOut();
      else router.push("/");
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setSigningOut(false);
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={title} aria-describedby={description}
      onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left text-[#17372f] shadow-2xl backdrop:bg-[#102820]/55 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-3xl sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eff5e9] text-[#155344]">
          <LogOut size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 id={title} className="text-xl font-bold tracking-tight">Sign out of OWEG?</h2>
          <p id={description} className="mt-1.5 text-sm leading-6 text-slate-600">
            You’ll need to sign in again to access your orders, wishlist, and saved addresses.
          </p>
        </div>
      </div>
      {!online && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Reconnect to the internet to sign out.</p>}
      {failed && online && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">We couldn’t confirm sign-out. Please try again.</p>}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button ref={cancelRef} type="button" onClick={onClose} disabled={signingOut}
          className="min-h-11 rounded-xl border border-[#d8e5d6] bg-white px-4 py-2 text-sm font-semibold text-[#155344] hover:bg-[#f4f8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155344] disabled:opacity-60">
          Stay signed in
        </button>
        <button type="button" disabled={signingOut || !online} aria-busy={signingOut} onClick={() => void confirm()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#982f32] px-4 py-2 text-sm font-semibold text-white hover:bg-[#802528] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#982f32] disabled:opacity-60">
          {signingOut && <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
          {signingOut ? "Signing out…" : failed ? "Retry sign-out" : "Sign out"}
        </button>
      </div>
    </dialog>
  );
}
