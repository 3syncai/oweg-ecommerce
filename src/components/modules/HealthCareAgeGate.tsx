"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearLegacyHealthCareAgeStorage,
  readHealthCareAgeVerified,
  writeHealthCareAgeVerified,
} from "@/lib/health-care-age-gate";

type HealthCareAgeGateProps = {
  /** When false, the gate is not shown (caller filters non–health-care pages). */
  enabled?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export default function HealthCareAgeGate({
  enabled = true,
}: HealthCareAgeGateProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  // Start locked until client memory is read — avoids unprotected flash.
  const [verified, setVerified] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    clearLegacyHealthCareAgeStorage();
    setMounted(true);
    setVerified(readHealthCareAgeVerified());
    setReady(true);
  }, []);

  const open = enabled && ready && !verified;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusInitial = () => {
      confirmButtonRef.current?.focus();
    };
    // Defer so the portal is committed before focusing.
    const focusTimer = window.setTimeout(focusInitial, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  const handleConfirm = () => {
    writeHealthCareAgeVerified();
    setVerified(true);
  };

  const handleExit = () => {
    router.push("/");
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[420px] rounded-3xl bg-white px-6 py-8 text-center shadow-2xl sm:px-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-care-age-gate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-5 flex w-full max-w-[240px] items-center justify-center">
          <Image
            src="/images/health-care-age-gate.png"
            alt=""
            width={480}
            height={480}
            className="h-auto w-full object-contain"
            priority
          />
        </div>

        <h2
          id="health-care-age-gate-title"
          className="text-2xl font-bold tracking-tight text-[#2C3340] sm:text-[28px]"
        >
          Are you 21 or older?
        </h2>

        <button
          ref={confirmButtonRef}
          type="button"
          onClick={handleConfirm}
          className="mt-6 inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#2B235A] px-6 text-base font-semibold text-white transition hover:bg-[#221C48]"
        >
          Yes I am!
        </button>

        <button
          type="button"
          onClick={handleExit}
          className="mt-4 cursor-pointer text-base font-medium text-[#2C3340] underline underline-offset-4 transition hover:text-[#111827]"
        >
          Exit
        </button>

        <p className="mt-6 text-xs leading-relaxed text-[#8A93A2]">
          By entering, you are agreeing to the{" "}
          <Link
            href="/terms"
            className="cursor-pointer underline underline-offset-2 hover:text-[#2C3340]"
          >
            Terms of use
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy-policy"
            className="cursor-pointer underline underline-offset-2 hover:text-[#2C3340]"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>,
    document.body
  );
}
